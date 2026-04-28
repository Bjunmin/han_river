# AIS 서버 NSSM 설정 가이드

> NSSM (Non-Sucking Service Manager)
> Windows 환경에서 AIS 서버를 백그라운드 서비스로 등록하고 자동 재시작을 관리합니다.

---

## 사전 준비

### 1. 빌드

```cmd
cd C:\경로\ais_server
npm run build
```

### 2. node.exe 경로 확인

```cmd
where node
```

예시 출력:
```
C:\Users\사용자명\AppData\Roaming\nvm\v20.11.0\node.exe
```

---

## 서비스 등록

### GUI 방식 (처음 등록 시 권장)

```cmd
nssm install ais-server
```

GUI 창에서 아래와 같이 입력:

| 탭 | 항목 | 값 |
|----|------|----|
| Application | Path | `C:\Users\사용자명\AppData\Roaming\nvm\v20.x.x\node.exe` |
| Application | Startup directory | `C:\경로\ais_server` |
| Application | Arguments | `dist\main.js` |
| Exit actions | Default action | `Restart` |
| Exit actions | Delay restart by | `3000` ms |

**Install service** 버튼 클릭 후 시작:

```cmd
nssm start ais-server
```

### 커맨드 방식

```cmd
nssm install ais-server "C:\Users\사용자명\AppData\Roaming\nvm\v20.x.x\node.exe" "dist\main.js"
nssm set ais-server AppDirectory "C:\경로\ais_server"
nssm set ais-server AppExit Default Restart
nssm set ais-server AppRestartDelay 3000
nssm set ais-server AppThrottle 5000
nssm start ais-server
```

---

## 재시작 설정 확인 / 수정

```cmd
nssm edit ais-server
```

Exit actions 탭 확인:
- Default action: **Restart**
- Delay restart by: **3000 ms**

커맨드로 강제 적용:

```cmd
nssm set ais-server AppExit Default Restart
nssm set ais-server AppRestartDelay 3000
```

---

## 자주 쓰는 명령어

```cmd
nssm start ais-server       # 시작
nssm stop ais-server        # 중지
nssm restart ais-server     # 재시작
nssm status ais-server      # 상태 확인
nssm edit ais-server        # 설정 편집 (GUI)
nssm remove ais-server      # 서비스 제거
```

---

## 코드 수정 후 재배포

```cmd
npm run build
nssm restart ais-server
```

---

## 로그 확인

NSSM GUI의 **I/O 탭**에서 로그 파일 경로 지정 가능:

| 항목 | 경로 예시 |
|------|-----------|
| stdout | `C:\경로\ais_server\logs\nssm-out.log` |
| stderr | `C:\경로\ais_server\logs\nssm-error.log` |

또는 애플리케이션 자체 로그:

```
C:\경로\ais_server\logs\ais-YYYY-MM-DD.log
```

---

## 트러블슈팅

### 서버가 등록은 됐는데 시작이 안 될 때

```cmd
nssm edit ais-server
```
- Path의 node.exe 경로가 정확한지 확인
- Startup directory 경로가 정확한지 확인
- `dist\main.js` 파일이 존재하는지 확인 (`npm run build` 필요)

### NSSM이 재시작을 안 할 때

AppThrottle 문제 — 서버가 너무 빠르게 반복 종료되면 NSSM이 재시작을 중단함.

```cmd
nssm set ais-server AppThrottle 5000
nssm set ais-server AppRestartDelay 3000
nssm restart ais-server
```

### USB 장치 탈거 후 서버가 죽는 문제

코드 수정으로 해결됨 (2025년 이후 빌드):
- `main.ts`: `process.exit(1)` 제거 — uncaughtException 발생해도 프로세스 유지
- `ais.service.ts`: `removeAllListeners()` 후 더미 `error` 핸들러 추가 — OS error 이벤트 흡수

빌드 후 재배포 필수:
```cmd
npm run build
nssm restart ais-server
```
