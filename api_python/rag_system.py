import json
import os
import re
from typing import List, Dict, Any

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
            # Use pure python list for embeddings to avoid numpy dependency
            self.embeddings_matrix = embeddings
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

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity without numpy"""
        if not vec1 or not vec2: return 0.0
        
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm_a = sum(a * a for a in vec1) ** 0.5
        norm_b = sum(b * b for b in vec2) ** 0.5
        
        if norm_a == 0 or norm_b == 0: return 0.0
        return dot_product / (norm_a * norm_b)

    def search(self, query: str, top_k: int = 5, alpha: float = 0.5) -> List[Dict]:
        if not self.documents: return []
        
        # Initialize scores
        doc_count = len(self.documents)
        final_scores = [0.0] * doc_count
        
        # 1. Vector Search (Manual calculation without numpy)
        if self.embeddings_matrix is not None:
            query_vec = self._get_query_embedding(query)
            if query_vec:
                vector_scores = []
                for doc_emb in self.embeddings_matrix:
                    score = self._cosine_similarity(doc_emb, query_vec)
                    vector_scores.append(score)
                
                # Normalize 0-1
                if vector_scores:
                    v_min = min(vector_scores)
                    v_max = max(vector_scores)
                    v_range = v_max - v_min if v_max > v_min else 1.0
                    
                    for i in range(doc_count):
                        normalized_score = (vector_scores[i] - v_min) / v_range if v_max > v_min else 0
                        final_scores[i] += alpha * normalized_score
        
        # 2. BM25 Search
        if self.bm25:
            tokenized_query = self._tokenize(query)
            bm25_scores = self.bm25.get_scores(tokenized_query)
            
            # Normalize 0-1
            if len(bm25_scores) > 0:
                b_min = min(bm25_scores)
                b_max = max(bm25_scores)
                b_range = b_max - b_min if b_max > b_min else 1.0
                
                # If vector search failed/disabled, use 100% BM25
                weight = (1 - alpha) if self.embeddings_matrix is not None else 1.0
                
                for i in range(doc_count):
                    normalized_score = (bm25_scores[i] - b_min) / b_range if b_max > b_min else 0
                    final_scores[i] += weight * normalized_score
            
        # Get Top K manually
        indexed_scores = list(enumerate(final_scores))
        indexed_scores.sort(key=lambda x: x[1], reverse=True)
        top_indices = [idx for idx, score in indexed_scores[:top_k]]
        
        results = []
        for idx in top_indices:
            if final_scores[idx] > 0: # Filter zero relevance
                doc = self.documents[idx]
                results.append({
                    "content": doc.content,
                    "metadata": doc.metadata,
                    "score": float(final_scores[idx])
                })
            
        return results

# Singleton instance for FastAPI
search_engine = None

def get_search_engine():
    global search_engine
    if search_engine is None:
        search_engine = HybridSearchEngine()
    return search_engine
