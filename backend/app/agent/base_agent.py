from google.adk.agents import Agent
from google.adk.tools import google_search  # Import the tool

root_agent = Agent(
    name="basic_search_agent",
    model="gemini-2.0-flash-exp",
    description="Agent to answer questions using Google Search.",
    instruction=(
        "You are an expert researcher. Always respond in plain text only. "
        "NEVER USE:\n"
        "- Markdown\n"
        "- Bullet points\n"
        "- Asterisks\n"
        "- Headers\n"
        "- Special formatting\n"
        "Use complete sentences with proper punctuation. "
        "Respond like a natural conversation."
    ),
    tools=[google_search]
)