.PHONY: setup prepare-data train evaluate run-backend run-frontend
setup:
	python -m pip install -r backend/requirements.txt
prepare-data:
	python ml/download_data.py
train:
	python ml/train.py
evaluate:
	python ml/evaluate.py
run-backend:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
run-frontend:
	cd frontend && npm run dev
