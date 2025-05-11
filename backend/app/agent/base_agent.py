import re
from pypdf import PdfReader
from google.adk.agents import Agent
from google.adk.tools import google_search


# Simplified PDF Processor
class PDFProcessor:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.full_text = ""

    def process_pdf(self):
        """Extract all text from PDF"""
        reader = PdfReader(self.file_path)
        self.full_text = "\n".join([page.extract_text() for page in reader.pages])

        # Basic cleanup
        self.full_text = re.sub(r'\s+', ' ', self.full_text)  # Remove extra whitespace
        self.full_text = self.full_text.strip()


# Modified Agent with Full Document Context
root_agent = Agent(
    name="document_agent",
    model="gemini-2.0-flash-exp",
    description="Agent that uses full document context",
    instruction=lambda session: (
        # Access document_text from session.metadata
        f"Use this document context to answer questions:\n{session.state.get('document_text', '')}\n\n" # Ensure .get() for safety
        "Respond in clear, natural sentences without markdown. "
    ),
    tools=[google_search]  # Optional: Keep web search as fallback
)