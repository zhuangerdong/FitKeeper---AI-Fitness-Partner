import json
import os
import numpy as np
from sentence_transformers import SentenceTransformer
from rank_bm25 import BM25Okapi
import re
from typing import List, Dict, Any

class Document:
    def __init__(self, id: str, content: str, metadata: Dict[str, Any]):
        self.id = id
        self.content = content
        self.metadata = metadata

class HybridSearchEngine:
    def __init__(self, model_name="all-MiniLM-L6-v2"):
        self.documents: List[Document] = []
        self.model = SentenceTransformer(model_name)
        self.embeddings = None
        self.bm25 = None
        
        self.load_and_chunk_data()
        self._build_indexes()
        
    def load_and_chunk_data(self):
        # Load scientific knowledge
        try:
            with open('data/scientific_training_knowledge.json', 'r', encoding='utf-8') as f:
                sci_kb = json.load(f)
                
                # Simple chunking for scientific kb
                for topic, content in sci_kb.items():
                    if isinstance(content, dict):
                        # Flatten to string
                        text = f"Topic: {topic}\n" + json.dumps(content, ensure_ascii=False, indent=2)
                        doc = Document(id=f"sci_{topic}", content=text, metadata={"source": "scientific", "topic": topic})
                        self.documents.append(doc)
                    elif isinstance(content, str):
                        doc = Document(id=f"sci_{topic}", content=f"Topic: {topic}\n{content}", metadata={"source": "scientific", "topic": topic})
                        self.documents.append(doc)
        except Exception as e:
            print(f"Error loading scientific KB: {e}")

        # Load fitness knowledge (exercises)
        try:
            with open('data/fitness_knowledge_base.json', 'r', encoding='utf-8') as f:
                fit_kb = json.load(f)
                
                # Principles
                if "training_principles" in fit_kb:
                    for topic, content in fit_kb["training_principles"].items():
                        text = f"Principle: {topic}\n" + json.dumps(content, ensure_ascii=False, indent=2)
                        doc = Document(id=f"principle_{topic}", content=text, metadata={"source": "principles", "topic": topic})
                        self.documents.append(doc)
                
                # Exercises
                if "curated_exercises_by_muscle_and_equipment" in fit_kb:
                    db = fit_kb["curated_exercises_by_muscle_and_equipment"]
                    for muscle, equipments in db.items():
                        for equipment, exercises in equipments.items():
                            for ex in exercises:
                                text = f"Exercise: {ex['name']}\nMuscle: {muscle}\nEquipment: {equipment}\nType: {ex.get('type', '')}\nForce: {ex.get('force', '')}\nSecondary Muscles: {', '.join(ex.get('secondary', []))}"
                                doc = Document(
                                    id=f"ex_{ex['name']}", 
                                    content=text, 
                                    metadata={"source": "exercise", "muscle": muscle, "equipment": equipment, "name": ex['name']}
                                )
                                self.documents.append(doc)
        except Exception as e:
            print(f"Error loading fitness KB: {e}")

    def _tokenize(self, text):
        # Simple tokenization for Chinese and English
        # Lowercase and keep alphanumeric and common CJK ideographs
        text = text.lower()
        return re.findall(r'[\u4e00-\u9fa5]+|[a-zA-Z0-9]+', text)

    def _build_indexes(self):
        if not self.documents:
            print("No documents loaded for hybrid search.")
            return
            
        print(f"Building hybrid index for {len(self.documents)} documents...")
        
        contents = [doc.content for doc in self.documents]
        self.embeddings = self.model.encode(contents, convert_to_numpy=True)
        
        tokenized_corpus = [self._tokenize(doc.content) for doc in self.documents]
        self.bm25 = BM25Okapi(tokenized_corpus)
        
        print("Hybrid index built successfully.")

    def search(self, query: str, top_k: int = 5, alpha: float = 0.5) -> List[Dict]:
        """
        Hybrid search combining Vector and BM25 scores.
        alpha: weight for vector search. (1 - alpha) is for keyword search.
        """
        if not self.documents:
            return []
            
        # 1. Vector Search
        query_embedding = self.model.encode([query])[0]
        # Calculate Cosine similarity safely
        norms = np.linalg.norm(self.embeddings, axis=1, keepdims=True)
        # Avoid division by zero
        norms[norms == 0] = 1e-10 
        norm_embeddings = self.embeddings / norms
        
        q_norm = np.linalg.norm(query_embedding)
        norm_query = query_embedding / q_norm if q_norm > 0 else query_embedding
        
        vector_scores = np.dot(norm_embeddings, norm_query)
        
        # Normalize vector scores to 0-1
        v_min, v_max = np.min(vector_scores), np.max(vector_scores)
        if v_max > v_min:
            vector_scores = (vector_scores - v_min) / (v_max - v_min)
        else:
            vector_scores = np.zeros_like(vector_scores)
            
        # 2. BM25 Search
        tokenized_query = self._tokenize(query)
        bm25_scores = self.bm25.get_scores(tokenized_query)
        
        # Normalize BM25 scores to 0-1
        b_min, b_max = np.min(bm25_scores), np.max(bm25_scores)
        if b_max > b_min:
            bm25_scores = (bm25_scores - b_min) / (b_max - b_min)
        else:
            bm25_scores = np.zeros_like(bm25_scores)
            
        # 3. Combine Scores
        hybrid_scores = alpha * vector_scores + (1 - alpha) * bm25_scores
        
        # 4. Get Top K
        top_indices = np.argsort(hybrid_scores)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            doc = self.documents[idx]
            results.append({
                "content": doc.content,
                "metadata": doc.metadata,
                "score": float(hybrid_scores[idx])
            })
            
        return results

# Singleton instance for FastAPI
search_engine = None

def get_search_engine():
    global search_engine
    if search_engine is None:
        search_engine = HybridSearchEngine()
    return search_engine
