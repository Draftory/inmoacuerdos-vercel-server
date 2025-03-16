// Function to generate a unique contract ID
function generateUniqueContractID() {
  return 'CONTRACT-' + Math.random().toString(36).substr(2, 9);
}

// Function to initialize the contract ID on first interaction with the form
function initializeUniqueContractID(event) {
  const form = document.querySelector("#wf-form-1-00---Locacion-de-vivienda");
  let contractIDInput = form.querySelector("input[name='contractID']");

  if (!contractIDInput.value) {
    contractIDInput.value = generateUniqueContractID();
  }

  // Remove the event listeners after the ID is generated
  form.removeEventListener("focusin", initializeUniqueContractID);
  form.removeEventListener("change", initializeUniqueContractID);
}

// Add event listeners to the form itself, to ensure it only runs once
const form = document.querySelector("#wf-form-1-00---Locacion-de-vivienda");
form.addEventListener("focusin", initializeUniqueContractID);
form.addEventListener("change", initializeUniqueContractID);

// Function to get current timestamp in Buenos Aires timezone
function getBuenosAiresTimestamp() {
  const now = new Date();
  return now.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

// Function to handle saving as draft
async function saveUniqueDraft(event) {
  if (event) event.preventDefault();

  const formData = new FormData(form);
  const formObject = Object.fromEntries(formData);

  // Ensure contract ID exists
  if (!formObject.contractID) {
    alert("No contract ID found. Please interact with the form to generate an ID.");
    return;
  }

  // Add required fields
  formObject.draftVersion = parseInt(formObject.draftVersion) || 1;
  formObject.status = "Draft";
  formObject.timestamp = getBuenosAiresTimestamp();

  // Exclude file upload data
  delete formObject.logoInmobiliaria;

  console.log("Form Object (Client-Side):", formObject);

  try {
    const serverUrl = "https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-post-draft-final";

    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ formData: formObject }),
    });

    if (response.ok) {
      const result = await response.json();

      if (result.updated) {
        alert("Draft updated successfully!");
      } else {
        alert("Draft saved successfully!");
      }

      form.querySelector("input[name='draftVersion']").value = formObject.draftVersion + 1;
    } else {
      console.error("Error saving draft:", response.statusText);
      alert("Error saving draft.");
    }
  } catch (error) {
    console.error("Error:", error);
    alert("Error saving draft.");
  }
}

// Event listener for the save draft button
document.querySelector('.save-as-draft-btn').addEventListener('click', saveUniqueDraft);

// Handle form submission to set status to Final
form.addEventListener("submit", function () {
  document.querySelector("input[name='status']").value = "Final";
});

// Unsaved changes alert before leaving the page
let isFormDirtyUnique = false;
form.addEventListener("change", function () {
  isFormDirtyUnique = true;
});

window.addEventListener("beforeunload", function (event) {
  if (isFormDirtyUnique) {
    event.preventDefault();
    event.returnValue = '';
  }
});