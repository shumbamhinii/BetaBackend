# test_qx_reports.py
from gradio_client import Client

def main():
    client = Client("Quantilytix/Qx-Reports")
    print("Connected. Checking endpoints...")
    print(client.view_api())  # Inspect available endpoint names and parameters

    # Example: send your text description — adjust "your input text here" as needed
    response = client.predict("your input text here", api_name="/predict")
    print("API response:", response)

if __name__ == "__main__":
    main()
