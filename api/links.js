JavaScript
const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');

const app = express();
app.use(cors());
app.use(express.json());

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const linksDbId = process.env.NOTION_LINKS_DB_ID;

// Vercel 파일 기반 라우팅 호환을 위해 경로를 유연하게('*') 수용
app.get(['/api/links', '*'], async (req, res) => {
    try {
        const response = await notion.databases.query({
            database_id: linksDbId,
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

app.patch(['/api/links', '*'], async (req, res) => {
    const { pageId, propertyName, newValue } = req.body;

    if (!pageId || !propertyName || newValue === undefined) {
        return res.status(400).json({ success: false, error: '잘못된 요청' });
    }

    try {
        await notion.pages.update({
            page_id: pageId,
            properties: {
                [propertyName]: { rich_text: [{ text: { content: newValue } }] }
            }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: '계정 업데이트 실패' });
    }
});

module.exports = app;