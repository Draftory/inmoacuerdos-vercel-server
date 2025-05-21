import fetch from "node-fetch";

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_USER_COLLECTION_ID = process.env.WEBFLOW_USER_COLLECTION_ID;

export async function webflowUtility(contractID, fieldData) {
  if (!WEBFLOW_API_TOKEN || !WEBFLOW_USER_COLLECTION_ID) {
    console.warn(
      "WEBFLOW_API_TOKEN or WEBFLOW_USER_COLLECTION_ID not configured."
    );
    return { success: false, error: "Webflow API not configured." };
  }

  try {
    const itemNameFieldSlug = "name";
    const fetchUrl = new URL(
      `https://api.webflow.com/v2/collections/${WEBFLOW_USER_COLLECTION_ID}/items`
    );
    fetchUrl.searchParams.set(itemNameFieldSlug, contractID);

    const listItemsResponse = await fetch(fetchUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
        "accept-version": "2.0.0",
      },
    });
    const listItemsData = await listItemsResponse.json();
    const existingItem = listItemsData.items?.[0];

    let webflowResponse;
    let requestBodyWF;
    const updateUrlWF = existingItem
      ? `https://api.webflow.com/v2/collections/${WEBFLOW_USER_COLLECTION_ID}/items/${existingItem._id}/live`
      : `https://api.webflow.com/v2/collections/${WEBFLOW_USER_COLLECTION_ID}/items/live`;
    const methodWF = existingItem ? "PATCH" : "POST";

    if (methodWF === "POST") {
      requestBodyWF = { fieldData: fieldData };
    } else {
      requestBodyWF = {
        fieldData: fieldData,
        isArchived: false,
        isDraft: false,
      };
    }

    console.log(
      `Webflow ${methodWF} Request Body (Utility):`,
      JSON.stringify(requestBodyWF)
    );

    webflowResponse = await fetch(updateUrlWF, {
      method: methodWF,
      headers: {
        Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
        "accept-version": "2.0.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBodyWF),
    });

    const webflowResult = await webflowResponse.json();
    console.log("Webflow API Response (Utility):", webflowResult);

    if (!webflowResponse.ok) {
      console.error(
        "Error interacting with Webflow API (Utility):",
        webflowResult
      );
      return {
        success: false,
        error: "Error interacting with Webflow API.",
        details: webflowResult,
      };
    }

    return { success: true, data: webflowResult };
  } catch (error) {
    console.error("Error in webflowUtility:", error);
    return { success: false, error: error.message };
  }
}
