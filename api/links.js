const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const linksDbId = process.env.NOTION_LINKS_DB_ID;

// Express 없이 Vercel 서버리스 환경에서 직접 실행되는 네이티브 함수
module.exports = async (req, res) => {
    // CORS (교차 출처 리소스 공유) 허용 세팅
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // 브라우저의 사전 요청(Preflight) 처리
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 1. [GET] 링크 목록 조회
    if (req.method === 'GET') {
        try {
            const response = await notion.databases.query({
            database_id: linksDbId,
            sorts: [
                { property: '그룹', direction: 'ascending' },
                { property: '순서', direction: 'ascending' }
            ]
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

            return res.status(200).json({ success: true, data: links });
        } catch (error) {
            return res.status(500).json({ success: false, error: '링크 데이터 조회 실패' });
        }
    }

    // 2. [PATCH] 아이디/비밀번호 수정
    if (req.method === 'PATCH') {
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

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ success: false, error: '계정 업데이트 실패' });
        }
    }

    // 그 외의 잘못된 요청 차단
    return res.status(405).json({ success: false, error: '허용되지 않은 메서드' });
};