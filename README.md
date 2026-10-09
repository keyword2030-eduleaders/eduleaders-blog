# eduleaders-blog

실무형 학원컨설팅 에듀리더스 블로그(https://eduleaders3500.blogspot.com) 글 저장소입니다.

## 구조

```
posts/<slug>/
  post.html    Blogger에 들어갈 본문 HTML
  meta.json    제목, 영문 제목(slugTitle), 라벨, 검색 설명
  *.png        본문 이미지 (jsDelivr CDN으로 불러옴)
tools/prepare.py      원고 HTML + 이미지 → posts/<slug>/ 생성
apps-script/          Blogger 게시 도구(Google Apps Script) 원본
```

## 게시 흐름

1. `tools/prepare.py`로 `posts/<slug>/` 폴더를 만든다
2. 커밋하고 `main`에 푸시한다
3. 게시 도구 웹앱에 `action=publish&slug=<slug>`를 요청한다
   - 영문 제목으로 먼저 게시해 주소를 영문으로 고정한 뒤 한글 제목으로 바꾼다

이미지 주소: `https://cdn.jsdelivr.net/gh/keyword2030-eduleaders/eduleaders-blog@main/posts/<slug>/<파일>`

비밀 키는 이 저장소에 넣지 않는다 (Apps Script 스크립트 속성에만 보관).
