import os
from openai import OpenAI

api_key = "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"

client = OpenAI(
  base_url = "https://integrate.api.nvidia.com/v1",
  api_key = api_key
)

completion = client.chat.completions.create(
  model="nvidia/nemotron-mini-4b-instruct",
  messages=[{"role":"user","content":"hi"}],
  temperature=0.2,
  top_p=0.7,
  max_tokens=1024,
  stream=True
)

for chunk in completion:
  if chunk.choices[0].delta.content is not None:
    print(chunk.choices[0].delta.content, end="")
