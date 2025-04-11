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
    console.log('Received Memberstack Webhook Data:', JSON.stringify(memberstackData, null, 2));

    const memberstackId = memberstackData.payload?.id;
    const email = memberstackData.payload?.auth?.email;
    const name = memberstackData.payload?.customFields?.['first-name']; // Corrected line

    console.log('Extracted Data:', { memberstackId, email, name });

    if (!memberstackId || !email || !name) {
      console.error('Error: Missing required Memberstack data.');
      return new Response(JSON.stringify({ error: 'Missing required Memberstack data.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Create a new live item in Webflow using fetch
    const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
    const webflowCreateItemPayload = {
      isArchived: false,
      isDraft: false,
      fieldData: {
        name: name,
        slug: slug,
        email: email,
      },
    };
    console.log('Webflow Create Item Payload:', JSON.stringify(webflowCreateItemPayload, null, 2));

    const createWebflowItemResponse = await fetch(
      `${WEBFLOW_API_BASE_URL}/${WEBFLOW_API_VERSION}/collections/${WEBFLOW_USER_COLLECTION_ID}/items/live`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
        },
        body: JSON.stringify(webflowCreateItemPayload),
      }
    );

    console.log('Webflow Create Item Response Status:', createWebflowItemResponse.status);
    let webflowItemData;
    if (createWebflowItemResponse.ok) {
      webflowItemData = await createWebflowItemResponse.json();
      console.log('Webflow Create Item Response Data:', JSON.stringify(webflowItemData, null, 2));
      const webflowItemId = webflowItemData.id;

      // 2. Update Memberstack member
      const loginRedirectUrl = `/usuario/${memberstackId}`;
      const memberstackUpdatePayload = {
        loginRedirect: loginRedirectUrl,
        'Unique Webflow ID': webflowItemId,
      };
      console.log('Memberstack Update Payload:', JSON.stringify(memberstackUpdatePayload, null, 2));

      const updateMemberstackResponse = await fetch(
        `https://api.memberstack.com/v1/members/${memberstackId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${MEMBERSTACK_SECRET_KEY}`,
          },
          body: JSON.stringify(memberstackUpdatePayload),
        }
      );

      console.log('Memberstack Update Response Status:', updateMemberstackResponse.status);
      if (updateMemberstackResponse.ok) {
        const memberstackUpdateData = await updateMemberstackResponse.json();
        console.log('Memberstack Update Response Data:', JSON.stringify(memberstackUpdateData, null, 2));
        return new Response(JSON.stringify({ success: true, webflowItemId, loginRedirectUrl }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        const errorData = await updateMemberstackResponse.json();
        console.error('Error updating Memberstack member:', errorData);
        return new Response(
          JSON.stringify({ error: 'Failed to update Memberstack member.', details: errorData }),
          {
            status: updateMemberstackResponse.status,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    } else {
      const errorData = await createWebflowItemResponse.json();
      console.error('Error creating Webflow item:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to create Webflow item.', details: errorData }),
        {
          status: createWebflowItemResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error.', details: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}