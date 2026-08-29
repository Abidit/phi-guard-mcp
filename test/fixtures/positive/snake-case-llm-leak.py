import openai


def summarize_encounter(patient_name: str, patient_diagnosis: str) -> str:
    response = openai.ChatCompletion.create(model="gpt-4", messages=[{"role": "user", "content": f"{patient_name} has {patient_diagnosis}"}])
    return response.choices[0].message.content
