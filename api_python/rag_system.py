import json
import os
import re
from typing import List, Dict, Any
import numpy as np

# Use standard requests for API calls to keep dependencies light
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

try:
    from rank_bm25 import BM25Okapi
    BM25_AVAILABLE = True
except ImportError:
    BM25_AVAILABLE = False

# Configuration for API-based Embedding
EMBEDDING_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding"
EMBEDDING_MODEL = "text-embedding-v2"

class Document:
    def __init__(self, id: str, content: str, metadata: Dict[str, Any], embedding: List[float] = None):
        self.id = id
        self.content = content
        self.metadata = metadata
        self.embedding = embedding

class HybridSearchEngine:
    def __init__(self):
        self.documents: List[Document] = []
        self.embeddings_matrix = None
        self.bm25 = None
        self.api_key = os.getenv("DASHSCOPE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
        
        self.load_data()
        self._build_indexes()
        
    def load_data(self):
        # 1. Try to load pre-computed index first (Preferred for Serverless)
        index_path = 'data/knowledge_index.json'
        if os.path.exists(index_path):
            print(f"Loading pre-computed index from {index_path}...")
            try:
                with open(index_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for item in data:
                        doc = Document(
                            id=item['id'],
                            content=item['content'],
                            metadata=item['metadata'],
                            embedding=item.get('embedding')
                        )
                        self.documents.append(doc)
                print(f"Loaded {len(self.documents)} documents from index.")
                return
            except Exception as e:
                print(f"Error loading index file: {e}")

        # 2. Fallback: Load raw data (BM25 only, no embeddings)
        print("Pre-computed index not found. Loading raw data (Vector search will be disabled)...")
        self._load_raw_data()

    def _load_raw_data(self):
        # Load scientific knowledge
        try:
            with open('data/scientific_training_knowledge.json', 'r', encoding='utf-8') as f:
                sci_kb = json.load(f)
                for topic, content in sci_kb.items():
                    text = f"Topic: {topic}\n" + (json.dumps(content, ensure_ascii=False) if isinstance(content, dict) else content)
                    self.documents.append(Document(id=f"sci_{topic}", content=text, metadata={"source": "scientific", "topic": topic}))
        except Exception: pass

        # Load fitness knowledge
        try:
            with open('data/fitness_knowledge_base.json', 'r', encoding='utf-8') as f:
                fit_kb = json.load(f)
                if "training_principles" in fit_kb:
                    for topic, content in fit_kb["training_principles"].items():
                        text = f"Principle: {topic}\n" + json.dumps(content, ensure_ascii=False)
                        self.documents.append(Document(id=f"principle_{topic}", content=text, metadata={"source": "principles", "topic": topic}))
                if "curated_exercises_by_muscle_and_equipment" in fit_kb:
                    db = fit_kb["curated_exercises_by_muscle_and_equipment"]
                    for muscle, equipments in db.items():
                        for equipment, exercises in equipments.items():
                            for ex in exercises:
                                text = f"Exercise: {ex['name']}\nMuscle: {muscle}\nEquipment: {equipment}\nType: {ex.get('type', '')}"
                                self.documents.append(Document(id=f"ex_{ex['name']}", content=text, metadata={"source": "exercise", "muscle": muscle, "name": ex['name']}))
        except Exception: pass

    def _tokenize(self, text):
        text = text.lower()
        return re.findall(r'[\u4e00-\u9fa5]+|[a-zA-Z0-9]+', text)

    def _build_indexes(self):
        if not self.documents: return
            
        # Build BM25 Index
        if BM25_AVAILABLE:
            print("Building BM25 index...")
            tokenized_corpus = [self._tokenize(doc.content) for doc in self.documents]
            self.bm25 = BM25Okapi(tokenized_corpus)
        
        # Build Vector Index (if embeddings exist)
        embeddings = [doc.embedding for doc in self.documents if doc.embedding]
        if embeddings and len(embeddings) == len(self.documents):
            print("Building Vector index...")
            self.embeddings_matrix = np.array(embeddings)
            # Normalize for cosine similarity
            norms = np.linalg.norm(self.embeddings_matrix, axis=1, keepdims=True)
            norms[norms == 0] = 1e-10
            self.embeddings_matrix = self.embeddings_matrix / norms
        else:
            print("Vector index skipped (missing embeddings). Hybrid search will degrade to Keyword search.")

    def _get_query_embedding(self, query: str) -> List[float]:
        if not self.api_key or not REQUESTS_AVAILABLE: return None
        
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        data = {
            "model": EMBEDDING_MODEL,
            "input": {"texts": [query]},
            "parameters": {"text_type": "query"}
        }
        
        try:
            response = requests.post(EMBEDDING_API_URL, headers=headers, json=data, timeout=5)
            if response.status_code == 200:
                result = response.json()
                if "output" in result and "embeddings" in result["output"]:
                    return result["output"]["embeddings"][0]["embedding"]
        except Exception as e:
            print(f"Embedding API error: {e}")
        return None

    def search(self, query: str, top_k: int = 5, alpha: float = 0.5) -> List[Dict]:
        if not self.documents: return []
        
        scores = np.zeros(len(self.documents))
        
        # 1. Vector Search
        if self.embeddings_matrix is not None:
            query_vec = self._get_query_embedding(query)
            if query_vec:
                q_vec = np.array(query_vec)
                q_norm = np.linalg.norm(q_vec)
                if q_norm > 0: q_vec = q_vec / q_norm
                
                vector_scores = np.dot(self.embeddings_matrix, q_vec)
                # Normalize 0-1
                v_min, v_max = np.min(vector_scores), np.max(vector_scores)
                if v_max > v_min:
                    vector_scores = (vector_scores - v_min) / (v_max - v_min)
                
                scores += alpha * vector_scores
        
        # 2. BM25 Search
        if self.bm25:
            tokenized_query = self._tokenize(query)
            bm25_scores = self.bm25.get_scores(tokenized_query)
            # Normalize 0-1
            b_min, b_max = np.min(bm25_scores), np.max(bm25_scores)
            if b_max > b_min:
                bm25_scores = (bm25_scores - b_min) / (b_max - b_min)
            
            # If vector search failed/disabled, use 100% BM25
            weight = (1 - alpha) if self.embeddings_matrix is not None else 1.0
            scores += weight * bm25_scores
            
        # Get Top K
        top_indices = np.argsort(scores)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            if scores[idx] > 0: # Filter zero relevance
                doc = self.documents[idx]
                results.append({
                    "content": doc.content,
                    "metadata": doc.metadata,
                    "score": float(scores[idx])
                })
            
        return results

# Singleton instance for FastAPI
search_engine = None

def get_search_engine():
    global search_engine
    if search_engine is None:
        search_engine = HybridSearchEngine()
    return search_engine
