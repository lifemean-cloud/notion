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