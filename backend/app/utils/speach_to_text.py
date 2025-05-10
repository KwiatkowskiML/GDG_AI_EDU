import os
from google import genai

api_key = os.environ.get("GOOGLE_API_KEY")
client = genai.Client(api_key=api_key)
myfile = client.files.upload(file="/home/michal/studia/sem6/aipd/Znormalizowane/zdanie_a_1.wav")
prompt = 'Generate a transcript of the speech.'

response = client.models.generate_content(
  model='gemini-2.0-flash',
  contents=[prompt, myfile]
)

print(response.text)
