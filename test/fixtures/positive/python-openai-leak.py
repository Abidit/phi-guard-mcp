import openai


def summarize_visit(patient_name: str, diagnosis: str) -> str:
    response = openai.ChatCompletion.create(model="gpt-4", messages=[{"role": "user", "content": f"Patient {patient_name} presented with {diagnosis}"}])
    return response.choices[0].message.content
