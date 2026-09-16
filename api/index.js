const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');

const app = express();
app.use(cors());
app.use(express.json());

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// GET: 완료되지 않은 모든 할 일 조회 및 정렬 적용
app.get('/api', async (req, res) => {
    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            // 완료 체크박스가 해제된(false) 항목만 필터링
            filter: { property: '완료', checkbox: { equals: false } },
            // 다중 정렬 적용: 1순위 중요도(상->중->하), 2순위 날짜(최신순)
            sorts: [
                { property: '중요도', direction: 'ascending' },
                { property: '날짜', direction: 'descending' }
            ]
        });

        const todos = response.results.map(page => ({
            id: page.id,
            title: page.properties['할일']?.title[0]?.plain_text || '',
            completed: page.properties['완료']?.checkbox || false,
            importance: page.properties['중요도']?.select?.name || '중',
            dateStart: page.properties['날짜']?.date?.start || null,
            dateEnd: page.properties['날짜']?.date?.end || null
        }));

        res.json({ success: true, data: todos });
    } catch (error) {
        res.status(500).json({ success: false, error: '조회 실패' });
    }
});

// POST: 새 할 일 생성
app.post('/api', async (req, res) => {
    const { title, targetDate } = req.body;
    if (!title) return res.status(400).json({ success: false, error: '데이터 누락' });

    try {
        await notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
                '할일': { title: [{ text: { content: title } }] },
                '완료': { checkbox: false },
                '중요도': { select: { name: '중' } },
                '날짜': { date: { start: targetDate } }
            }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: '생성 실패' });
    }
});

// PATCH: 속성 업데이트 (완료, 중요도, 할일, 날짜)
app.patch('/api', async (req, res) => {
    const { pageId, propertyName, newValue } = req.body;
    if (!pageId || !propertyName || newValue === undefined) {
        return res.status(400).json({ success: false, error: '잘못된 요청' });
    }

    try {
        let updatePayload = {};

        if (propertyName === '완료') {
            updatePayload = { '완료': { checkbox: newValue } };
        } else if (propertyName === '중요도') {
            updatePayload = { '중요도': { select: { name: newValue } } };
        } else if (propertyName === '할일') {
            updatePayload = { '할일': { title: [{ text: { content: newValue } }] } };
        } else if (propertyName === '날짜') {
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