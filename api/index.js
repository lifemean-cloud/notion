const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');

const app = express();
app.use(cors());
app.use(express.json());

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// [GET] 노션 데이터 읽어오기
app.get('/api', async (req, res) => {
    try {
        // Vercel 서버(UTC) 기준 시간에 9시간을 더해 한국 시간(KST) 구하기
        const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const todayString = kstDate.toISOString().split('T')[0];

        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                property: '날짜',
                // 서버 시간이 아닌 한국 시간(todayString)으로 필터링
                date: { equals: todayString }
            },
            sorts: [{ property: '날짜', direction: 'ascending' }]
        });

        const todos = response.results.map(page => ({
            id: page.id,
            title: page.properties['할일']?.title[0]?.plain_text || '제목 없음',
            status: page.properties['상태']?.status?.name || '시작',
            importance: page.properties['중요도']?.select?.name || '중',
            dateStart: page.properties['날짜']?.date?.start || null,
            dateEnd: page.properties['날짜']?.date?.end || null
        }));

        res.json({ success: true, data: todos });
    } catch (error) {
        res.status(500).json({ success: false, error: '노션 API 조회 실패' });
    }
});

// [PATCH] 상태 및 중요도 수정하기
app.patch('/api', async (req, res) => {
    const { pageId, propertyName, newValue } = req.body;

    if (!pageId || !propertyName || !newValue) {
        return res.status(400).json({ success: false, error: '잘못된 요청입니다.' });
    }

    try {
        let updatePayload = {};

        if (propertyName === '상태') {
            updatePayload = { '상태': { status: { name: newValue } } };
        } else if (propertyName === '중요도') {
            updatePayload = { '중요도': { select: { name: newValue } } };
        }

        await notion.pages.update({
            page_id: pageId,
            properties: updatePayload
        });

        res.json({ success: true, message: '업데이트 성공' });
    } catch (error) {
        res.status(500).json({ success: false, error: '노션 API 업데이트 실패' });
    }
});

module.exports = app;