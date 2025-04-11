// app/api/Memberstack/Members/newMemberWebhook/route.js
import fetch from 'node-fetch';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY;
const WEBFLOW_USER_COLLECTION_ID = process.env.WEBFLOW_USER_COLLECTION_ID;
const WEBFLOW_API_BASE_URL = 'https://api.webflow.com';
const WEBFLOW_API_VERSION = 'v2';

export async function POST(req) {
  try {
    const memberstackData = await req.json();
    const { id: memberstackId, email, name } = memberstackData.payload; // Payload is nested

    if (!memberstackId || !email || !name) {
      return new Response(JSON.stringify({ error: 'Missing required Memberstack data.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Create a new live item in Webflow using fetch
    const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
    const createWebflowItemResponse = await fetch(
      `${WEBFLOW_API_BASE_URL}/${WEBFLOW_API_VERSION}/collections/${WEBFLOW_USER_COLLECTION_ID}/items/live`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
        },
        body: JSON.stringify({
          isArchived: false,
          isDraft: false,
          fieldData: {
            name: name,
            slug: slug,
            email: email,
          },
        }),
      }
    );

    if (!createWebflowItemResponse.ok) {
      const errorData = await createWebflowItemResponse.json();
      console.error('Error creating Webflow item:', errorData);
      return new Response(JSON.stringify({ error: 'Failed to create Webflow item.', details: errorData }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const webflowItemData = await createWebflowItemResponse.json();
    const webflowItemId = webflowItemData.id;

    // 2. Update Memberstack member
    const loginRedirectUrl = `/usuario/${memberstackId}`;
    const updateMemberstackResponse = await fetch(
      `https://api.memberstack.com/v1/members/${memberstackId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MEMBERSTACK_SECRET_KEY}`,
        },
        body: JSON.stringify({
          loginRedirect: loginRedirectUrl,
          'Unique Webflow ID': webflowItemId,
        }),
      }
    );

    if (!updateMemberstackResponse.ok) {
      const errorData = await updateMemberstackResponse.json();
      console.error('Error updating Memberstack member:', errorData);
      return new Response(JSON.stringify({ error: 'Failed to update Memberstack member.', details: errorData }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, webflowItemId, loginRedirectUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error.', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}