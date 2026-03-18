import json
import os
import requests
import time
from typing import List, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
API_KEY = os.getenv("DASHSCOPE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
EMBEDDING_URL = "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding"
MODEL_NAME = "text-embedding-v2" # Recommended for RAG

if not API_KEY:
    print("Error: DASHSCOPE_API_KEY or ANTHROPIC_API_KEY environment variable is required.")
    exit(1)

def get_embedding(text: str) -> List[float]:
    """Call DashScope API to get text embedding."""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": MODEL_NAME,
        "input": {"texts": [text]},
        "parameters": {"text_type": "document"}
    }
    
    try:
        response = requests.post(EMBEDDING_URL, headers=headers, json=data, timeout=10)
        response.raise_for_status()
        result = response.json()
        if "output" in result and "embeddings" in result["output"]:
            return result["output"]["embeddings"][0]["embedding"]
        else:
            print(f"API Error: {result}")
            return []
    except Exception as e:
        print(f"Request failed: {e}")
        return []

def main():
    documents = []
    
    # Load Scientific Knowledge
    try:
        with open('data/scientific_training_knowledge.json', 'r', encoding='utf-8') as f:
            sci_kb = json.load(f)
            print(f"Processing scientific knowledge ({len(sci_kb)} topics)...")
            for topic, content in sci_kb.items():
                if isinstance(content, dict):
                    text = f"Topic: {topic}\n" + json.dumps(content, ensure_ascii=False, indent=2)
                else:
                    text = f"Topic: {topic}\n{content}"
                
                documents.append({
                    "id": f"sci_{topic}",
                    "content": text,
                    "metadata": {"source": "scientific", "topic": topic}
                })
    except Exception as e:
        print(f"Error loading scientific KB: {e}")

    # Load Fitness Knowledge
    try:
        with open('data/fitness_knowledge_base.json', 'r', encoding='utf-8') as f:
            fit_kb = json.load(f)
            
            # Principles
            if "training_principles" in fit_kb:
                print(f"Processing training principles ({len(fit_kb['training_principles'])} items)...")
                for topic, content in fit_kb["training_principles"].items():
                    text = f"Principle: {topic}\n" + json.dumps(content, ensure_ascii=False, indent=2)
                    documents.append({
                        "id": f"principle_{topic}",
                        "content": text,
                        "metadata": {"source": "principles", "topic": topic}
                    })
            
            # Exercises
            if "curated_exercises_by_muscle_and_equipment" in fit_kb:
                db = fit_kb["curated_exercises_by_muscle_and_equipment"]
                count = 0
                print("Processing exercises...")
                for muscle, equipments in db.items():
                    for equipment, exercises in equipments.items():
                        for ex in exercises:
                            text = f"Exercise: {ex['name']}\nMuscle: {muscle}\nEquipment: {equipment}\nType: {ex.get('type', '')}\nForce: {ex.get('force', '')}\nSecondary Muscles: {', '.join(ex.get('secondary', []))}"
                            documents.append({
                                "id": f"ex_{ex['name']}", 
                                "content": text, 
                                "metadata": {"source": "exercise", "muscle": muscle, "equipment": equipment, "name": ex['name']}
                            })
                            count += 1
                print(f"Processed {count} exercises.")
    except Exception as e:
        print(f"Error loading fitness KB: {e}")

    print(f"Total documents to embed: {len(documents)}")
    print("Starting embedding generation (this may take a while)...")
    
    # Process in batches to respect rate limits if needed, but for simplicity one by one
    embedded_docs = []
    for i, doc in enumerate(documents):
        print(f"[{i+1}/{len(documents)}] Embedding: {doc['id']}")
        embedding = get_embedding(doc['content'])
        if embedding:
            doc['embedding'] = embedding
            embedded_docs.append(doc)
        time.sleep(0.1) # Rate limit safety
        
    # Save to file
    output_path = 'data/knowledge_index.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(embedded_docs, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully saved {len(embedded_docs)} embedded documents to {output_path}")

if __name__ == "__main__":
    main()
