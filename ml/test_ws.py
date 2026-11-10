import asyncio, json
import websockets

async def main():
    async with websockets.connect("ws://localhost:8000/ws/stream") as ws:
        for _ in range(8):
            data = json.loads(await ws.recv())
            print("--- tick", data[0]["tick"])
            for a in data:
                flag = "ALERT" if a["anomaly_detected"] else "ok"
                print(f"  {a['app']}: trust {a['trust_score']:5.1f} | {flag} | {a['reasons']}")

asyncio.run(main())