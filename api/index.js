const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');

const app = express();
app.use(cors());
app.use(express.json());

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

app.get('/api', async (req, res) => {
    try {
        let targetDate = req.query.date;
        if (!targetDate) {
            const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
            targetDate = kstDate.toISOString().split('T')[0];
        }

        const response = await notion.databases.query({
            database_id: databaseId,
            filter: { property: '날짜', date: { equals: targetDate } },
            sorts: [{ property: '날짜', direction: 'ascending' }]
        });

        const todos = response.results
            .filter(page => page.properties['상태']?.status?.name !== '완료')
            .map(page => ({
                id: page.id,
                title: page.properties['할일']?.title[0]?.plain_text || '',
                status: page.properties['상태']?.status?.name || '시작',
                importance: page.properties['중요도']?.select?.name || '중',
                dateStart: page.properties['날짜']?.date?.start || null,
                dateEnd: page.properties['날짜']?.date?.end || null
            }));

        res.json({ success: true, data: todos });
    } catch (error) {
        res.status(500).json({ success: false, error: '조회 실패' });
    }
});

app.post('/api', async (req, res) => {
    const { title, targetDate } = req.body;
    if (!title || !targetDate) return res.status(400).json({ success: false, error: '데이터 누락' });

    try {
        await notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
                '할일': { title: [{ text: { content: title } }] },
                '상태': { status: { name: '시작' } },
                '중요도': { select: { name: '중' } },
                '날짜': { date: { start: targetDate } }
            }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: '생성 실패' });
    }
});

// [PATCH] 날짜 수정 로직 추가
app.patch('/api', async (req, res) => {
    const { pageId, propertyName, newValue } = req.body;
    if (!pageId || !propertyName || newValue === undefined) {
        return res.status(400).json({ success: false, error: '잘못된 요청' });
    }

    try {
        let updatePayload = {};

        if (propertyName === '상태') {
            updatePayload = { '상태': { status: { name: newValue } } };
        } else if (propertyName === '중요도') {
            updatePayload = { '중요도': { select: { name: newValue } } };
        } else if (propertyName === '할일') {
            updatePayload = { '할일': { title: [{ text: { content: newValue } }] } };
        } else if (propertyName === '날짜') {
            // 날짜 업데이트 처리 (시작일이 없으면 전체 속성 삭제)
            if (!newValue.start) {
                updatePayload = { '날짜': null };
            } else {
                updatePayload = { '날짜': { date: { start: newValue.start, end: newValue.end || null } } };
            }
        }

        await notion.pages.update({
            page_id: pageId,
            properties: updatePayload
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: '업데이트 실패' });
    }
});

module.exports = app;

// ... (기존 할 일 위젯용 GET, POST, PATCH 코드는 그대로 유지) ...

// === [신규 추가] 링크 계정 관리 위젯 전용 라우터 ===

// 새로운 환경 변수(링크 DB ID) 호출
const linksDbId = process.env.NOTION_LINKS_DB_ID;

// 1. 링크 목록 조회
app.get('/api/links', async (req, res) => {
    try {
        const response = await notion.databases.query({
            database_id: linksDbId,
            // 그룹별로 정렬하여 프론트엔드에서 렌더링하기 쉽게 구성
            sorts: [{ property: '그룹', direction: 'ascending' }]
        });

        const links = response.results.map(page => ({
            id: page.id,
            name: page.properties['이름']?.title[0]?.plain_text || '이름 없음',
            group: page.properties['그룹']?.select?.name || '기타',
            url: page.properties['링크']?.url || '#',
            icon: page.properties['아이콘']?.url || 'https://www.google.com/s2/favicons?domain=google.com&sz=64',
            userId: page.properties['아이디']?.rich_text[0]?.plain_text || '',
            userPw: page.properties['비밀번호']?.rich_text[0]?.plain_text || ''
        }));

        res.json({ success: true, data: links });
    } catch (error) {
        res.status(500).json({ success: false, error: '링크 데이터 조회 실패' });
    }
});

// 2. 아이디/비밀번호 데이터베이스 업데이트
app.patch('/api/links', async (req, res) => {
    const { pageId, propertyName, newValue } = req.body;

    if (!pageId || !propertyName || newValue === undefined) {
        return res.status(400).json({ success: false, error: '잘못된 요청' });
    }

    try {
        await notion.pages.update({
            page_id: pageId,
            properties: {
                // 노션의 텍스트(Rich Text) 속성 업데이트 규격
                [propertyName]: { rich_text: [{ text: { content: newValue } }] }
            }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: '계정 업데이트 실패' });
    }
});

module.exports = app;