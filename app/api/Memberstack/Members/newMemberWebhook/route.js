// app/api/Memberstack/Members/newMemberWebhook/route.js
import memberstackAdmin from "@memberstack/admin";
import fetch from 'node-fetch';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY;
const WEBFLOW_USER_COLLECTION_ID = process.env.WEBFLOW_USER_COLLECTION_ID;
const WEBFLOW_API_BASE_URL = 'https://api.webflow.com';
const WEBFLOW_API_VERSION = 'v2';

// Initialize Memberstack Admin SDK
const memberstack = memberstackAdmin.init(MEMBERSTACK_SECRET_KEY);

export async function POST(req) {
  try {
    const memberstackData = await req.json();
    console.log('Received Memberstack Webhook Data:', JSON.stringify(memberstackData, null, 2));

    const memberstackId = memberstackData.payload?.id;
    const email = memberstackData.payload?.auth?.email;
    const name = memberstackData.payload?.customFields?.name;

    console.log('Extracted Data:', { memberstackId, email, name });

    if (!memberstackId || !email || !name) {
      console.error('Error: Missing required Memberstack data.');
      return new Response(JSON.stringify({ error: 'Missing required Memberstack data.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Create a new live item in Webflow using fetch
    const slug = memberstackId;
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

      // 2. Update Memberstack member using @memberstack/admin
      const loginRedirectUrl = `/usuario/${memberstackId}`;
      try {
        const { data: updatedMember } = await memberstack.members.update({
          id: memberstackId,
          data: {
            loginRedirect: loginRedirectUrl,
            metaData: {
              'Unique Webflow ID': webflowItemId,
            },
          },
        });
        console.log('Memberstack member updated successfully:', updatedMember);
        return new Response(JSON.stringify({ success: true, webflowItemId, loginRedirectUrl }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Error updating Memberstack member:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update Memberstack member.', details: error }),
          {
            status: 500,
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