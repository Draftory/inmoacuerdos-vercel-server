// api/memberstack-webhook.js
import { Webflow } from '@webflow/api';
import fetch from 'node-fetch'; // Or your preferred HTTP client

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY; // Renamed variable
const WEBFLOW_USER_COLLECTION_ID = process.env.WEBFLOW_USER_COLLECTION_ID;

const webflow = new Webflow({ token: WEBFLOW_API_TOKEN });

export default async (req, res) => {
  if (req.method === 'POST') {
    try {
      const memberstackData = req.body;
      const { id: memberstackId, email, name } = memberstackData.data;

      if (!memberstackId || !email || !name) {
        return res.status(400).json({ error: 'Missing required Memberstack data.' });
      }

      // 1. Create a new live item in Webflow
      const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, ''); // Basic slug generation
      const createWebflowItemResponse = await webflow.createItem({
        collectionId: WEBFLOW_USER_COLLECTION_ID,
        live: true,
        fields: {
          email: email,
          name: name,
          slug: slug,
          _draft: false, // Ensure it's created as a live item
        },
      });

      if (!createWebflowItemResponse.ok) {
        const errorData = await createWebflowItemResponse.json();
        console.error('Error creating Webflow item:', errorData);
        return res.status(500).json({ error: 'Failed to create Webflow item.' });
      }

      const webflowItemData = await createWebflowItemResponse.json();
      const webflowItemId = webflowItemData._id;

      // 2. Update Memberstack member
      const loginRedirectUrl = `/usuario/${memberstackId}`;
      const updateMemberstackResponse = await fetch(
        `https://api.memberstack.com/v1/members/${memberstackId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${MEMBERSTACK_SECRET_KEY}`, // Using the renamed variable
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
        return res.status(500).json({ error: 'Failed to update Memberstack member.' });
      }

      return res.status(200).json({ success: true, webflowItemId, loginRedirectUrl });
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  } else {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
};