import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app import main

client=TestClient(main.app)
def headers():
    r=client.post('/auth/register',json={'email':'test@example.com','password':'strong-pass-123'})
    if r.status_code==409: r=client.post('/auth/login',json={'email':'test@example.com','password':'strong-pass-123'})
    return {'Authorization':f"Bearer {r.json()['access_token']}"}
def test_auth_and_protection():
    assert client.get('/patients').status_code==401
    h=headers(); assert client.get('/patients',headers=h).status_code==200
def test_patient_crud():
    h=headers(); r=client.post('/patients',headers=h,json={'name':'Test Patient','age':30}); assert r.status_code==200
    pid=r.json()['id']; assert client.get(f'/patients/{pid}',headers=h).json()['name']=='Test Patient'
    assert client.put(f'/patients/{pid}',headers=h,json={'name':'Updated'}).status_code==200
    assert client.delete(f'/patients/{pid}',headers=h).status_code==200
def test_detect_rejects_invalid_type():
    h=headers(); r=client.post('/detect',headers=h,files={'file':('bad.txt',b'hello','text/plain')}); assert r.status_code==415
def test_detect_with_mocked_model(monkeypatch):
    from PIL import Image
    import io
    h=headers(); monkeypatch.setattr(main,'run_detection',lambda image,conf:[{'label':'sample-class','confidence':.9,'x1':1,'y1':1,'x2':8,'y2':8}])
    b=io.BytesIO(); Image.new('RGB',(10,10),'white').save(b,format='PNG')
    r=client.post('/detect?conf=0.4',headers=h,files={'file':('sample.png',b.getvalue(),'image/png')})
    assert r.status_code==200 and r.json()['boxes'][0]['label']=='sample-class'
def test_health(): assert client.get('/health').json()['status']=='ok'
