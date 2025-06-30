// app/api/Memberstack/Members/newMemberWebhook/route.js
import memberstackAdmin from "@memberstack/admin";
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { interactWithWebflow, batchUpdateWebflowItems } from '../../../../utils/apiUtils';

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
      
      // First, update all contracts in Supabase
      const supabaseUpdatePromises = existingContracts.map(async (contract) => {
        const { error: updateError } = await supabase
          .from('1.00 - Contrato de Locación de Vivienda - Database')
          .update({ MemberstackID: memberstackId })
          .eq('contractID', contract.contractID);

        if (updateError) {
          console.error(`Error updating contract ${contract.contractID}:`, updateError);
          return { success: false, contractId: contract.contractID, error: updateError };
        }
        return { success: true, contractId: contract.contractID };
      });

      const supabaseResults = await Promise.all(supabaseUpdatePromises);
      const successfulSupabaseUpdates = supabaseResults.filter(result => result.success).length;
      console.log(`Supabase updates completed: ${successfulSupabaseUpdates} successful`);

      // Now get all existing Webflow items for these contracts
      const webflowItemsToUpdate = [];
      
      for (const contract of existingContracts) {
        try {
          // Search for existing Webflow item
          const searchUrl = new URL(
            `https://api.webflow.com/v2/collections/${WEBFLOW_CONTRACT_COLLECTION_ID}/items`
          );
          searchUrl.searchParams.set('name', contract.contractID);

          const listItemsResponse = await fetch(searchUrl.toString(), {
            method: "GET",
            headers: {
              Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
              "accept-version": "2.0.0",
            },
          });

          const listItemsData = await listItemsResponse.json();

          if (listItemsData.items && listItemsData.items.length > 0) {
            const existingItem = listItemsData.items[0];
            
            // Create updated field data
            const updatedContract = {
              ...contract,
              MemberstackID: memberstackId
            };

            const formData = {};
            Object.keys(updatedContract).forEach(key => {
              formData[key] = updatedContract[key];
            });

            const fieldData = {
              editlink: formData["Editlink"] || null,
              denominacionlegallocadorpj1: formData["denominacionLegalLocadorPJ1"] || null,
              nombrelocatariopf1: formData["nombreLocatarioPF1"] || null,
              timestamp: formData["timestamp"] || null,
              status: formData["status"] || null,
              contrato: formData["Contrato"] || null,
              memberstackid: formData["MemberstackID"] || null,
              name: formData["contractID"] || "",
              slug: formData["contractID"] || "",
              domicilioinmueblelocado: formData["domicilioInmuebleLocado"] || null,
              ciudadinmueblelocado: formData["ciudadInmuebleLocado"] || null,
              provinciainmueblelocado: formData["provinciaInmuebleLocado"] || null,
              nombrelocadorpf1: formData["nombreLocadorPF1"] || null,
              denominacionlegallocatariopj1: formData["denominacionLegalLocatarioPJ1"] || null,
              pdffile: formData["PDFFile"] || null,
              docfile: formData["DOCFile"] || null,
              hiddeninputlocacionfechainicio: formData["hiddenInputLocacionFechaInicio"] || null,
              hiddeninputlocacionfechatermino: formData["hiddenInputLocacionFechaTermino"] || null,
              personaslocador: formData["PersonasLocador"] || null,
              personaslocatario: formData["PersonasLocatario"] || null,
              pago: formData["pago"] || null,
              linkdepago: formData["linkdepago"] || null
            };

            webflowItemsToUpdate.push({
              id: existingItem.id,
              fieldData: fieldData
            });
          }
        } catch (error) {
          console.error(`Error preparing Webflow update for contract ${contract.contractID}:`, error);
        }
      }

      // Perform batch update if we have items to update
      if (webflowItemsToUpdate.length > 0) {
        console.log(`Preparing to batch update ${webflowItemsToUpdate.length} Webflow items`);
        
        const batchResult = await batchUpdateWebflowItems(
          webflowItemsToUpdate,
          WEBFLOW_API_TOKEN,
          WEBFLOW_CONTRACT_COLLECTION_ID
        );

        if (batchResult.success) {
          console.log(`Successfully batch updated ${batchResult.updatedCount} Webflow contracts with Memberstack ID: ${memberstackId}`);
        } else {
          console.error('Error in batch Webflow update:', batchResult.error);
          if (batchResult.details) {
            console.error('Details:', batchResult.details);
          }
        }
      } else {
        console.log('No Webflow items found to update');
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

    // Add retry logic for Webflow user creation
    let createWebflowUserResponse;
    let webflowUserData;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        createWebflowUserResponse = await fetch(
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
        
        if (createWebflowUserResponse.status === 429) {
          // Rate limited, wait and retry
          const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`Rate limited, waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }

        if (!createWebflowUserResponse.ok) {
          const errorData = await createWebflowUserResponse.json();
          console.error('Error creating Webflow user:', errorData);
          
          if (retryCount < maxRetries - 1) {
            const waitTime = Math.pow(2, retryCount) * 1000;
            console.log(`Retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
            continue;
          }
          
          return new Response(
            JSON.stringify({ error: 'Failed to create Webflow user after retries.', details: errorData }),
            {
              status: createWebflowUserResponse.status,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        webflowUserData = await createWebflowUserResponse.json();
        console.log('Webflow Create User Response Data:', JSON.stringify(webflowUserData, null, 2));
        break; // Success, exit retry loop
        
      } catch (error) {
        console.error(`Error in Webflow user creation attempt ${retryCount + 1}:`, error);
        if (retryCount < maxRetries - 1) {
          const waitTime = Math.pow(2, retryCount) * 1000;
          console.log(`Retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }
        throw error;
      }
    }

    const webflowUserId = webflowUserData.id;

    // 3. Update Memberstack member with Webflow data
    const loginRedirectUrl = `/usuario/${memberstackId}`;
    let memberstackUpdateSuccess = false;
    let memberstackError = null;
    
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
      memberstackUpdateSuccess = true;
    } catch (error) {
      console.error('Error updating Memberstack member:', error);
      memberstackError = error;
      
      // Don't fail the entire webhook if Memberstack update fails
      // The main operations (Supabase and Webflow) are working
    }

    // Return success even if Memberstack update fails
    return new Response(JSON.stringify({ 
      success: true, 
      webflowUserId, 
      loginRedirectUrl,
      existingContractsUpdated: existingContracts?.length || 0,
      memberstackUpdateSuccess,
      memberstackError: memberstackError ? {
        message: memberstackError.message,
        code: memberstackError.code
      } : null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
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