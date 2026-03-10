import sys
import os

# Add the project root to the python path so we can import api_python
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api_python.main import app
