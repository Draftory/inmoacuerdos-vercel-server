// app/api/Memberstack/Members/newMemberWebhook/route.js
import memberstackAdmin from "@memberstack/admin";
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { interactWithWebflow } from '../../../../utils/apiUtils';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const MEMBERSTACK_SECRET_KEY = process.env.MEMBERSTACK_SECRET_KEY;
const WEBFLOW_USER_COLLECTION_ID = process.env.WEBFLOW_USER_COLLECTION_ID;
const WEBFLOW_CONTRACT_COLLECTION_ID = process.env.WEBFLOW_CONTRACT_COLLECTION_ID;
const WEBFLOW_API_BASE_URL = 'https://api.webflow.com';
const WEBFLOW_API_VERSION = 'v2';

// Initialize Memberstack Admin SDK
const memberstack = memberstackAdmin.init(MEMBERSTACK_SECRET_KEY);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const memberstackData = await req.json();
    console.log('Received Memberstack Webhook Data:', JSON.stringify(memberstackData, null, 2));

    // Extract data from the correct location in the payload
    const memberstackId = memberstackData.payload?.id;
    const email = memberstackData.payload?.auth?.email;
    const firstName = memberstackData.payload?.customFields?.['first-name'];
    const name = firstName || email?.split('@')[0]; // Fallback to email username if no first name

    console.log('Extracted Data:', { 
      memberstackId, 
      email, 
      firstName,
      name,
      customFields: memberstackData.payload?.customFields,
      fullPayload: memberstackData.payload
    });

    if (!memberstackId || !email) {
      console.error('Error: Missing required Memberstack data.', {
        hasMemberstackId: !!memberstackId,
        hasEmail: !!email,
        payload: memberstackData.payload
      });
      return new Response(JSON.stringify({ 
        error: 'Missing required Memberstack data.',
        details: {
          hasMemberstackId: !!memberstackId,
          hasEmail: !!email
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check for existing contracts with matching email
    const { data: existingContracts, error: searchError } = await supabase
      .from('1.00 - Contrato de Locación de Vivienda - Database')
      .select('*')
      .or(`emailMember.eq.${email},emailGuest.eq.${email}`);

    if (searchError) {
      console.error('Error searching for existing contracts:', searchError);
      return new Response(JSON.stringify({ error: 'Error searching for existing contracts.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Update existing contracts with Memberstack ID
    if (existingContracts && existingContracts.length > 0) {
      console.log(`Found ${existingContracts.length} existing contracts for email ${email}`);
      
      for (const contract of existingContracts) {
        // Update Supabase
        const { error: updateError } = await supabase
          .from('1.00 - Contrato de Locación de Vivienda - Database')
          .update({ MemberstackID: memberstackId })
          .eq('contractID', contract.contractID);

        if (updateError) {
          console.error(`Error updating contract ${contract.contractID}:`, updateError);
          continue;
        }

        // Update Webflow Contratos collection
        try {
          // Create a copy of the contract with updated MemberstackID
          const updatedContract = {
            ...contract,
            MemberstackID: memberstackId
          };

          const webflowUpdateResult = await interactWithWebflow(
            contract.contractID,
            WEBFLOW_API_TOKEN,
            WEBFLOW_CONTRACT_COLLECTION_ID,
            Object.keys(updatedContract),
            Object.values(updatedContract),
            updatedContract.PDFFile || null,
            updatedContract.DOCFile || null,
            Object.values(updatedContract),
            null,  // sheets
            null,  // spreadsheetId
            null,  // sheetName
            -1,    // rowIndex
            Object.keys(updatedContract).indexOf("Editlink")  // editlinkColumnIndex
          );

          if (!webflowUpdateResult.success) {
            console.error(`Error updating Webflow contract ${contract.contractID}:`, webflowUpdateResult.error);
            if (webflowUpdateResult.details) {
              console.error('Details:', webflowUpdateResult.details);
            }
          } else {
            console.log(`Successfully updated Webflow contract ${contract.contractID} with Memberstack ID: ${memberstackId}`);
          }
        } catch (webflowError) {
          console.error(`Error updating Webflow contract ${contract.contractID}:`, webflowError);
        }
      }
    }

    // 2. Create a new user in Webflow Usuarios collection
    const slug = memberstackId;
    const webflowCreateUserPayload = {
      isArchived: false,
      isDraft: false,
      fieldData: {
        name: name,
        slug: slug,
        email: email
      }
    };
    console.log('Webflow Create User Payload:', JSON.stringify(webflowCreateUserPayload, null, 2));

    const createWebflowUserResponse = await fetch(
      `${WEBFLOW_API_BASE_URL}/${WEBFLOW_API_VERSION}/collections/${WEBFLOW_USER_COLLECTION_ID}/items/live`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
        },
        body: JSON.stringify(webflowCreateUserPayload),
      }
    );

    console.log('Webflow Create User Response Status:', createWebflowUserResponse.status);
    let webflowUserData;
    if (!createWebflowUserResponse.ok) {
      const errorData = await createWebflowUserResponse.json();
      console.error('Error creating Webflow user:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to create Webflow user.', details: errorData }),
        {
          status: createWebflowUserResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    webflowUserData = await createWebflowUserResponse.json();
    console.log('Webflow Create User Response Data:', JSON.stringify(webflowUserData, null, 2));
    const webflowUserId = webflowUserData.id;

    // 3. Update Memberstack member with Webflow data
    const loginRedirectUrl = `/usuario/${memberstackId}`;
    try {
      console.log('Updating Memberstack member with Webflow data:', {
        id: memberstackId,
        loginRedirect: loginRedirectUrl,
        webflowUserId
      });

      const { data: updatedMember } = await memberstack.members.update({
        id: memberstackId,
        data: {
          loginRedirect: loginRedirectUrl,
          customFields: {
            'webflow-member-id': webflowUserId,
          },
        },
      });
      
      console.log('Memberstack member updated successfully:', updatedMember);
      return new Response(JSON.stringify({ 
        success: true, 
        webflowUserId, 
        loginRedirectUrl,
        existingContractsUpdated: existingContracts?.length || 0 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error updating Memberstack member:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to update Memberstack member.', 
          details: error,
          webflowUserId // Include the Webflow user ID in case we need to retry manually
        }),
        {
          status: 500,
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