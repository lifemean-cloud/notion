const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');

const app = express();
app.use(cors());
app.use(express.json());

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// [GET] 날짜 기반 데이터 조회 및 완료 항목 필터링
app.get('/api', async (req, res) => {
    try {
        let targetDate = req.query.date;
        if (!targetDate) {
            const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
            targetDate = kstDate.toISOString().split('T')[0];
        }

        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                property: '날짜',
                date: { equals: targetDate }
            },
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
        res.status(500).json({ success: false, error: '노션 API 조회 실패' });
    }
});

// [POST] 새로운 할 일 생성
app.post('/api', async (req, res) => {
    const { title, targetDate } = req.body;

    if (!title || !targetDate) {
        return res.status(400).json({ success: false, error: '제목 또는 날짜가 누락되었습니다.' });
    }

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

        res.json({ success: true, message: '생성 성공' });
    } catch (error) {
        res.status(500).json({ success: false, error: '노션 API 생성 실패' });
    }
});

// [PATCH] 상태, 중요도, 할일(제목) 통합 수정
app.patch('/api', async (req, res) => {
    const { pageId, propertyName, newValue } = req.body;

    if (!pageId || !propertyName || newValue === undefined) {
        return res.status(400).json({ success: false, error: '잘못된 요청입니다.' });
    }

    try {
        let updatePayload = {};

        if (propertyName === '상태') {
            updatePayload = { '상태': { status: { name: newValue } } };
        } else if (propertyName === '중요도') {
            updatePayload = { '중요도': { select: { name: newValue } } };
        } else if (propertyName === '할일') {
            updatePayload = { '할일': { title: [{ text: { content: newValue } }] } };
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