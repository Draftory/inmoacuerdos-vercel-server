// api/memberstack-webhook.js
import fetch from 'node-fetch';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN; // Use your Webflow API token
const MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY;
const WEBFLOW_USER_COLLECTION_ID = process.env.WEBFLOW_USER_COLLECTION_ID;
const WEBFLOW_API_BASE_URL = 'https://api.webflow.com';
const WEBFLOW_API_VERSION = 'v2';

export default async (req, res) => {
  if (req.method === 'POST') {
    try {
      const memberstackData = req.body;
      const { id: memberstackId, email, name } = memberstackData.data;

      if (!memberstackId || !email || !name) {
        return res.status(400).json({ error: 'Missing required Memberstack data.' });
      }

      // 1. Create a new live item in Webflow using fetch
      const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, ''); // Basic slug generation
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
              email: email, // Add the email field
            },
          }),
        }
      );

      if (!createWebflowItemResponse.ok) {
        const errorData = await createWebflowItemResponse.json();
        console.error('Error creating Webflow item:', errorData);
        return res.status(500).json({ error: 'Failed to create Webflow item.', details: errorData });
      }

      const webflowItemData = await createWebflowItemResponse.json();
      const webflowItemId = webflowItemData.id; // Use the 'id' from the response

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
        return res.status(500).json({ error: 'Failed to update Memberstack member.', details: errorData });
      }

      return res.status(200).json({ success: true, webflowItemId, loginRedirectUrl });
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(500).json({ error: 'Internal server error.', details: error.message });
    }
  } else {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
};