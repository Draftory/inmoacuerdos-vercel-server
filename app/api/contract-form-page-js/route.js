// pages/api/frontend-injection.js
import { NextResponse } from "next/server";

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

export async function OPTIONS(req) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS", // Changed to GET
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return new NextResponse(null, {
    status: 204,
    headers: headers,
  });
}

export async function GET(req) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS", // Changed to GET
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "text/html", // Set content type to HTML
  };

  /* 💙 MEMBERSCRIPT #51 v0.2 💙 DISPLAY MEMBER METADATA */
  function replaceTextWithMetadata(metadata) {
    var els = Array.from(document.querySelectorAll("[ms-code-member-meta]"));
    els.forEach((el) => {
      const key = el.getAttribute("ms-code-member-meta");
      const value = metadata[key];
      if (value !== undefined) {
        el.innerHTML = value;
        el.value = value;
        el.src = value;
      }
    });
  }

  const memberstack = window.$memberstackDom;
  memberstack
    .getCurrentMember()
    .then(({ data: member }) => {
      if (member && member.metaData) {
        replaceTextWithMetadata(member.metaData);
      }
    })
    .catch((error) => {
      console.error("Error retrieving member data:", error);
    });

  /* build payment url */
  document.addEventListener("DOMContentLoaded", function () {
    const botonFinalizar = document.getElementById("boton-finalizar");

    if (botonFinalizar) {
      botonFinalizar.addEventListener("click", function () {
        // Obtén los valores de los inputs usando their 'name'
        const contractID = document.querySelector('[name="contractID"]').value;
        const Contrato = document.querySelector('[name="Contrato"]').value;
        const MemberstackIDInput = document.querySelector(
          '[name="MemberstackID"]'
        );
        const MemberstackID = MemberstackIDInput
          ? MemberstackIDInput.value
          : ""; // Obtén el valor si el elemento existe, sino una cadena vacía

        // Loggea los valores antes de construir la URL
        console.log("Contract ID (antes de la URL):", contractID);
        console.log("Contrato (antes de la URL):", Contrato);
        console.log("Memberstack ID (antes de la URL):", MemberstackID);

        // Construye la URL con los parámetros
        let urlPago = `https://www.inmoacuerdos.com/editor-documentos/payment?contractID=${encodeURIComponent(
          contractID
        )}&Contrato=${encodeURIComponent(Contrato)}`;

        // Añade el MemberstackID a la URL solo si tiene un valor
        if (MemberstackID) {
          urlPago += `&MemberstackID=${encodeURIComponent(MemberstackID)}`;
        }

        // Loggea la URL construida
        console.log("URL de pago construida:", urlPago);

        // Redirige al usuario a la página de pago
        window.location.href = urlPago;
      });
    } else {
      console.error('No se encontró el botón "boton-finalizar"');
    }
  });

  /* Generate contract ID */
  // Function to generate a unique contract ID
  function generateUniqueContractID() {
    return Math.random().toString(36).substr(2, 9);
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

  // Function to get current timestamp in Buenos Aires timezone in 24-hour format
  function getBuenosAiresTimestamp() {
    const now = new Date();
    return now.toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false, // Explicitly disable 12-hour format
    });
  }

  // Function to handle saving as draft/final
  async function saveContractVersion(event, status, redirectUrl = "/success") {
    if (event) event.preventDefault();

    const formData = new FormData(form);
    const formObject = Object.fromEntries(formData);

    // Ensure contract ID exists
    if (!formObject.contractID) {
      alert(
        "No contract ID found. Please interact with the form to generate an ID."
      );
      return;
    }

    // Add required fields
    formObject.draftVersion = parseInt(formObject.draftVersion) || 1;
    formObject.status = status; // Set status here
    form.querySelector("input[name='status']").value = status; // Also set the input field directly
    formObject.timestamp = getBuenosAiresTimestamp();

    // Exclude file upload data
    //delete formObject.logoInmobiliaria;

    console.log("Form Object (Client-Side):", formObject);

    try {
      const serverUrl =
        "https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-post-draft-final";

      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formObject), // Send the formObject directly
      });

      if (response.ok) {
        const result = await response.json();

        // Redirect based on the provided redirectUrl
        window.location.href = redirectUrl;

        form.querySelector("input[name='draftVersion']").value =
          formObject.draftVersion + 1;
      } else {
        console.error("Error guardando " + status + ":", response.statusText);
        alert("Error guardando " + status + ".");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error guardando " + status + ".");
    }
  }

  // Event listener for the save draft button
  document
    .querySelector(".save-as-draft-btn")
    .addEventListener("click", (event) =>
      saveContractVersion(event, "Borrador")
    );

  // Event listener for the original save final button
  document
    .querySelector(".save-as-final-btn")
    .addEventListener("click", (event) =>
      saveContractVersion(event, "Contrato")
    );

  // Handle form submission to set status to Final (if submitted via standard form submit)
  form.addEventListener("submit", function () {
    document.querySelector("input[name='status']").value = "Contrato";
  });

  // Function to get a query parameter by name
  function getQueryParam(name) {
    const urlSearchParams = new URLSearchParams(window.location.search);
    return urlSearchParams.get(name);
  }

  // Function to prefill form based on contractID and memberstackID
  async function prefillFormFromUrl() {
    const contractID = getQueryParam("contractID");

    // Get the memberstackID
    window.$memberstackDom.getCurrentMember().then(({ data: member }) => {
      if (member) {
        const memberstackID = member.id;

        if (contractID && memberstackID) {
          fetchDraftData(contractID, memberstackID);
        } else {
          console.error(
            "contractID is missing from the URL or memberstackID could not be retrieved."
          );
        }
      } else {
        console.error(
          "User is not logged in or Memberstack object not available."
        );
      }
    });
  }

  async function fetchDraftData(contractID, memberstackID) {
    try {
      const draftServerUrl = `https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-edit-contract`;
      const response = await fetch(draftServerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contractID: contractID,
          memberstackID: memberstackID,
        }),
      });

      if (response.ok) {
        const draftData = await response.json();
        if (draftData) {
          // Prefill form fields
          const form = document.querySelector("form"); // Replace with your form selector
          for (const key in draftData) {
            const inputField = form.querySelector(`[name="${key}"]`);
            if (inputField) {
              inputField.value = draftData[key];
            }
          }
          // Dispatch a custom event after prefilling the form
          document.dispatchEvent(new Event("formDataLoaded"));
        } else {
          console.log(
            "No draft data found for contractID:",
            contractID,
            "and memberstackID:",
            memberstackID
          );
        }
      } else {
        console.error("Error fetching draft data:", response.statusText);
      }
    } catch (error) {
      console.error("Error fetching draft data:", error);
    }
  }

  // Call the prefill function when the page loads
  document.addEventListener("DOMContentLoaded", prefillFormFromUrl);

  /* carrousel functionality */
  document.addEventListener("DOMContentLoaded", function () {
    const steps = document.querySelectorAll(".form_step");
    const nextButtons = document.querySelectorAll(".is-next");
    const prevButtons = document.querySelectorAll(".is-prev");
    const saveAsFinalButton = document.querySelector(".save-as-final-btn");
    const progressBarInner = document.querySelector(".progress_bar-inner");
    const messageElement = document.querySelector(".h5.message");
    const formBlock = document.querySelector(".form_block");

    let currentStep = 0;

    function scrollToTop() {
      formBlock.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }

    function showStep(step) {
      steps.forEach((stepElement, index) => {
        stepElement.style.display = index === step ? "flex" : "none";
      });

      if (step === steps.length - 1) {
        nextButtons.forEach((button) => (button.style.display = "none"));
        prevButtons.forEach((button) => (button.style.display = "flex"));
        saveAsFinalButton.style.display = "flex"; // Change to flex here
      } else {
        nextButtons.forEach((button) => (button.style.display = "flex"));
        prevButtons.forEach(
          (button) => (button.style.display = step > 0 ? "flex" : "none")
        );
        saveAsFinalButton.style.display = "none";
      }

      const progressPercentage = ((step + 1) / steps.length) * 100;
      progressBarInner.style.width = `${progressPercentage}%`;

      scrollToTop();
    }

    function validateStep(step) {
      const inputs = steps[step].querySelectorAll(
        "input[required], select[required], textarea[required]"
      );
      let valid = true;

      inputs.forEach((input) => {
        if (input.type === "radio") {
          const radioGroup = steps[step].querySelectorAll(
            `input[name="${input.name}"]`
          );
          const checked = Array.from(radioGroup).some((radio) => radio.checked);
          if (!checked) {
            valid = false;
          }
        } else if (!input.value) {
          valid = false;
        }
      });

      if (!valid) {
        messageElement.textContent =
          "Por favor completar los campos obligatorios.";
      } else {
        messageElement.textContent = "";
      }

      return valid;
    }

    showStep(currentStep);

    nextButtons.forEach((button) => {
      button.addEventListener("click", function () {
        if (validateStep(currentStep)) {
          if (currentStep < steps.length - 1) {
            currentStep++;
            showStep(currentStep);
          }
        }
      });
    });

    prevButtons.forEach((button) => {
      button.addEventListener("click", function () {
        if (currentStep > 0) {
          currentStep--;
          showStep(currentStep);
        }
      });
    });
  });

  /* Placeholder Replacement */
  // List of placeholders that should be hidden and not replaced until the user provides input
  const hiddenPlaceholders = [
    "nupciasLocadorPF1",
    "conyugeLocadorPF1",
    "nupciasLocadorPF2",
    "conyugeLocadorPF2",
    "nupciasLocadorPF3",
    "conyugeLocadorPF3",
    "nupciasLocadorPF4",
    "conyugeLocadorPF4",
    "nupciasLocadorPF5",
    "conyugeLocadorPF5",
    "nupciasLocatarioPF1",
    "conyugeLocatarioPF1",
    "nupciasLocatarioPF2",
    "conyugeLocatarioPF2",
    "nupciasLocatarioPF3",
    "conyugeLocatarioPF3",
    "nupciasLocatarioPF4",
    "conyugeLocatarioPF4",
    "nupciasLocatarioPF5",
    "conyugeLocatarioPF5",
    "nupciasGarantePF1",
    "conyugeGarantePF1",
    "nupciasGarantePF2",
    "conyugeGarantePF2",
    "nupciasGarantePF3",
    "conyugeGarantePF3",
    "clausulaAdicional",
    "escrituraAdjuntaLocadorApoderadoPJ1",
    "escrituraAdjuntaLocadorApoderadoPF1",
    "escrituraAdjuntaLocadorApoderadoPJ2",
    "escrituraAdjuntaLocadorApoderadoPF2",
    "escrituraAdjuntaLocadorApoderadoPJ3",
    "escrituraAdjuntaLocadorApoderadoPF3",
    "escrituraAdjuntaLocadorApoderadoPJ4",
    "escrituraAdjuntaLocadorApoderadoPF4",
    "escrituraAdjuntaLocadorApoderadoPJ5",
    "escrituraAdjuntaLocadorApoderadoPF5",
    "escrituraAdjuntaLocatarioApoderadoPJ1",
    "escrituraAdjuntaLocatarioApoderadoPF1",
    "escrituraAdjuntaLocatarioApoderadoPJ2",
    "escrituraAdjuntaLocatarioApoderadoPF2",
    "escrituraAdjuntaLocatarioApoderadoPJ3",
    "escrituraAdjuntaLocatarioApoderadoPF3",
    "escrituraAdjuntaLocatarioApoderadoPJ4",
    "escrituraAdjuntaLocatarioApoderadoPF4",
    "escrituraAdjuntaLocatarioApoderadoPJ5",
    "escrituraAdjuntaLocatarioApoderadoPF5",
    "escrituraAdjuntaGaranteApoderadoPJ1",
    "escrituraAdjuntaGaranteApoderadoPF1",
    "escrituraAdjuntaGaranteApoderadoPJ2",
    "escrituraAdjuntaGaranteApoderadoPF2",
    "escrituraAdjuntaGaranteApoderadoPJ3",
    "escrituraAdjuntaGaranteApoderadoPF3",
    "locadorRepresentacionPF1",
    "locadorRepresentacionPF2",
    "locadorRepresentacionPF3",
    "locadorRepresentacionPF4",
    "locadorRepresentacionPF5",
    "locatarioRepresentacionPF1",
    "locatarioRepresentacionPF2",
    "locatarioRepresentacionPF3",
    "locatarioRepresentacionPF4",
    "locatarioRepresentacionPF5",
    "garanteRepresentacionPF1",
    "garanteRepresentacionPF2",
    "garanteRepresentacionPF3",
    "descripcionInmuebleLocado",
    "locacionAmoblado",
    "adjuntaFotosLocacionAmoblado",
    "locacionCochera",
    "locacionBaulera",
  ];

  // Global variable to store fetched clauses
  let cachedClauses = [];

  // To store the previous selected value for radio button groups
  let previousRadioSelections = {};

  function formatPlaceholdersForClauses(placeholderString) {
    const placeholderRegex = /{{(.*?)}}/g;
    return placeholderString.replace(placeholderRegex, (match, p1) => {
      return hiddenPlaceholders.includes(p1)
        ? `<span class="preview-placeholder hidden" data-placeholder="${p1}"></span>`
        : `<span class="preview-placeholder nestedclause" data-placeholder="${p1}">_________</span>`;
    });
  }

  // Function to fetch clauses from Google Sheets
  async function fetchClausesFromSheet() {
    const url =
      "https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-get-clauses";
    const response = await fetch(url);
    const data = await response.json();
    cachedClauses = data.values; // store the fetched clauses globally
  }

  async function updateSpecificPlaceholder(placeholderKey) {
    const correspondingInputs = document.getElementsByName(placeholderKey);
    if (!correspondingInputs || correspondingInputs.length === 0) return;

    let inputValue = "";
    if (
      correspondingInputs[0].type === "radio" ||
      correspondingInputs[0].type === "checkbox"
    ) {
      correspondingInputs.forEach((input) => {
        if (input.checked) inputValue = input.value;
      });
      if (
        previousRadioSelections[placeholderKey] &&
        previousRadioSelections[placeholderKey] !== inputValue
      ) {
        clearPlaceholdersForPreviousSelection(
          previousRadioSelections[placeholderKey]
        );
      }
      previousRadioSelections[placeholderKey] = inputValue;
    } else {
      inputValue = correspondingInputs[0].value || "";
    }

    if (inputValue === "") return;

    let clauseText = "";
    for (const row of cachedClauses) {
      const [placeholderName, clauseDefinition, clause] = row;
      if (
        placeholderName === placeholderKey &&
        clauseDefinition === inputValue
      ) {
        clauseText = formatPlaceholdersForClauses(clause);
        break;
      }
    }

    const placeholderElements = document.querySelectorAll(
      `.preview-placeholder[data-placeholder="${placeholderKey}"]`
    );
    placeholderElements.forEach((placeholderElement) => {
      placeholderElement.innerHTML =
        clauseText ||
        `<span style="font-weight: bold; color: var(--untitled-ui--primary600);">${inputValue}</span>`;
      placeholderElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  function clearPlaceholdersForPreviousSelection(previousValue) {
    document
      .querySelectorAll(
        `.preview-placeholder[data-placeholder*="${previousValue}"]`
      )
      .forEach((placeholder) => (placeholder.innerHTML = "_________"));
  }

  function updateHiddenInputs() {
    document.querySelectorAll('input[type="hidden"]').forEach((hiddenInput) => {
      if (hiddenInput.value) updateSpecificPlaceholder(hiddenInput.name);
    });
  }

  function addEventListenersToInputs() {
    const form = document.getElementById("wf-form-1-00---Locacion-de-vivienda");
    if (form) {
      form
        .querySelectorAll("input[name], textarea[name], select[name]")
        .forEach((element) => {
          element.addEventListener("input", () => {
            updateSpecificPlaceholder(element.name);
            updateHiddenInputs();
          });
        });
    }
  }

  // Function to update placeholders for pre-filled inputs on page load
  async function updatePlaceholdersOnLoad() {
    const form = document.getElementById("wf-form-1-00---Locacion-de-vivienda");
    if (form) {
      form
        .querySelectorAll("input[name], textarea[name], select[name]")
        .forEach((element) => {
          updateSpecificPlaceholder(element.name);
        });
      updateHiddenInputs();
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await fetchClausesFromSheet();
    await updatePlaceholdersOnLoad();
    addEventListenersToInputs();
  });

  // Function to update placeholders for pre-filled inputs on page load
  async function updatePlaceholdersOnLoad() {
    const form = document.getElementById("wf-form-1-00---Locacion-de-vivienda");
    if (form) {
      form
        .querySelectorAll("input[name], textarea[name], select[name]")
        .forEach((element) => {
          updateSpecificPlaceholder(element.name);
        });
      updateHiddenInputs();
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await fetchClausesFromSheet();
    // Moved updatePlaceholdersOnLoad to the formDataLoaded event listener
    addEventListenersToInputs();
  });

  // Listen for the formDataLoaded event
  document.addEventListener("formDataLoaded", async () => {
    await updatePlaceholdersOnLoad();
  });

  /* formatter termination date */
  document.addEventListener("DOMContentLoaded", function () {
    const unidadPlazo = document.getElementById("inputLocacionUnidadPlazo");
    const cantidadUnidad = document.getElementById(
      "inputLocacionCantidadUnidad"
    );
    const comienzoSelector = document.getElementById(
      "inputSelectorLocacionComienz"
    );
    const customStartDate = document.getElementById("custom-start-date");
    const fechaInicioDiv = document.getElementById(
      "Fecha-inicio-locacion-vivienda"
    );
    const fechaTerminoDiv = document.getElementById(
      "mostrarFechaTerminoLocacion"
    );
    const hiddenInputFechaInicio = document.getElementById(
      "hiddenInputLocacionFechaInicio"
    );
    const hiddenInputFechaTermino = document.getElementById(
      "hiddenInputLocacionFechaTermino"
    );
    const hiddenInputPlazo = document.getElementById(
      "hiddenInputLocacionPlazo"
    );

    function numberToSpanishWords(num, units) {
      const ones = [
        "",
        "un",
        "dos",
        "tres",
        "cuatro",
        "cinco",
        "seis",
        "siete",
        "ocho",
        "nueve",
      ];
      const teens = [
        "diez",
        "once",
        "doce",
        "trece",
        "catorce",
        "quince",
        "dieciséis",
        "diecisiete",
        "dieciocho",
        "diecinueve",
      ];
      const tens = [
        "",
        "",
        "veinte",
        "treinta",
        "cuarenta",
        "cincuenta",
        "sesenta",
        "setenta",
        "ochenta",
        "noventa",
      ];

      if (num === 1 && units === "días") return "un";
      if (num === 1 && units === "año") return "un";
      if (num === 1 && units === "mes") return "un";

      if (num < 10) return ones[num];
      else if (num < 20) return teens[num - 10];
      else if (num < 30)
        return num === 20 ? "veinte" : "veinti" + ones[num - 20];
      else if (num < 100)
        return (
          tens[Math.floor(num / 10)] +
          (num % 10 !== 0 ? " y " + ones[num % 10] : "")
        );
      else if (num < 1000) {
        const hundreds = [
          "",
          "cien",
          "doscientos",
          "trescientos",
          "cuatrocientos",
          "quinientos",
          "seiscientos",
          "setecientos",
          "ochocientos",
          "novecientos",
        ];
        return (
          hundreds[Math.floor(num / 100)] +
          (num % 100 !== 0 ? " " + numberToSpanishWords(num % 100) : "")
        );
      } else {
        return num; // Fallback for numbers 1000 and above
      }
    }

    function updateHiddenInput(hiddenInput, value) {
      hiddenInput.value = value;
      console.log(`Updated ${hiddenInput.id} with value: ${value}`);
      const event = new Event("input", { bubbles: true });
      hiddenInput.dispatchEvent(event);
    }

    function formatTermDescription() {
      const units = unidadPlazo.value;
      const quantity = parseInt(cantidadUnidad.value, 10);

      if (units && !isNaN(quantity) && quantity > 0) {
        const quantityInWords = numberToSpanishWords(quantity, units);
        const unitForm = quantity === 1 ? units.slice(0, -1) : units; // Remove 's' for singular
        const formattedTerm = `${quantityInWords} (${quantity}) ${unitForm}`;
        console.log(`Formatted term description: ${formattedTerm}`);
        updateHiddenInput(hiddenInputPlazo, formattedTerm);
      } else {
        console.log("Invalid term data. Please enter all required values.");
        updateHiddenInput(hiddenInputPlazo, "");
      }
    }

    function calculateTerminationDate(startDate) {
      const units = unidadPlazo.value;
      const quantity = parseInt(cantidadUnidad.value, 10);

      console.log(
        `Calculating termination date with start date: ${startDate}, units: ${units}, quantity: ${quantity}`
      );

      if (!units || isNaN(quantity) || quantity <= 0) {
        fechaTerminoDiv.textContent =
          "Por favor, ingrese todos los datos correctamente.";
        console.log("Missing or invalid units/quantity values.");
        return;
      }

      // Format start date to Spanish format and store it
      const options = { day: "numeric", month: "long", year: "numeric" };
      const formattedStartDate = startDate.toLocaleDateString("es-ES", options);
      updateHiddenInput(hiddenInputFechaInicio, formattedStartDate);

      // Calculate termination date based on unit selection and quantity
      let endDate = new Date(startDate);
      switch (units) {
        case "días":
          endDate.setDate(endDate.getDate() + quantity);
          break;
        case "meses":
          endDate.setMonth(endDate.getMonth() + quantity);
          break;
        case "años":
          endDate.setFullYear(endDate.getFullYear() + quantity);
          break;
      }

      // Subtract 1 day only for months or years
      if (units !== "días") {
        endDate.setDate(endDate.getDate() - 1);
      }

      // Format termination date to Spanish format and display/store it
      const formattedEndDate = endDate.toLocaleDateString("es-ES", options);
      console.log(`Calculated end date: ${formattedEndDate}`);
      fechaTerminoDiv.textContent = `Fecha de finalización de la locación: ${formattedEndDate}`;
      updateHiddenInput(hiddenInputFechaTermino, formattedEndDate);
    }

    function toggleStartDateInput() {
      if (comienzoSelector.value === "Fecha posterior") {
        fechaInicioDiv.style.display = "block";
      } else {
        fechaInicioDiv.style.display = "none";
        customStartDate.value = "";
      }
    }

    comienzoSelector.addEventListener("change", function () {
      toggleStartDateInput();
      let startDate;
      if (
        comienzoSelector.value === "Fecha posterior" &&
        customStartDate.value
      ) {
        startDate = new Date(customStartDate.value);
        startDate.setDate(startDate.getDate() + 1); // Automatically add one day
      } else {
        startDate = new Date(); // Use current date if no custom date is selected
      }
      console.log(`Start date set to: ${startDate}`);
      formatTermDescription();
      calculateTerminationDate(startDate);
    });

    [unidadPlazo, cantidadUnidad, customStartDate].forEach((input) => {
      input.addEventListener("change", function () {
        let startDate;
        if (
          comienzoSelector.value === "Fecha posterior" &&
          customStartDate.value
        ) {
          startDate = new Date(customStartDate.value);
          startDate.setDate(startDate.getDate() + 1); // Automatically add one day
        } else {
          startDate = new Date(); // Use current date if no custom date is selected
        }
        console.log(`Start date set to: ${startDate}`);
        formatTermDescription();
        calculateTerminationDate(startDate);
      });
    });
  });

  /* prevent submission on enter */
  // Prevent form submission on pressing Enter in any input field
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("wf-form-1-00---Locacion-de-vivienda");

    if (form) {
      form.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault(); // Prevent the default form submission
        }
      });
    } else {
      console.error("Form not found!");
    }
  });

  /* Selector Persona Locadora */
  document.addEventListener("DOMContentLoaded", function () {
    // Get the select element
    var selectElement = document.getElementById("PersonasLocador");

    // Function to show/hide the correct divs based on the selected value
    function toggleDivs() {
      // First, hide all the divs
      document.getElementById("Locadora-1-persona").style.display = "none";
      document.getElementById("Locadora-2-persona").style.display = "none";
      document.getElementById("Locadora-3-persona").style.display = "none";
      document.getElementById("Locadora-4-persona").style.display = "none";
      document.getElementById("Locadora-5-persona").style.display = "none";

      // Get the selected number of people
      var selectedValue = selectElement.value;
      var numPeople = parseInt(selectedValue.charAt(0)); // Get the number (1-5)

      // Show the divs based on the number of people selected
      for (var i = 1; i <= numPeople; i++) {
        document.getElementById("Locadora-" + i + "-persona").style.display =
          "block";
      }
    }

    // Attach the change event listener to the select element
    selectElement.addEventListener("change", toggleDivs);

    // Initial check in case there's a default value selected
    // **Modified to ensure Locadora-1-persona is visible on load**
    if (selectElement.value === "1 persona") {
      document.getElementById("Locadora-1-persona").style.display = "block";
    } else {
      toggleDivs();
    }
  });

  /* Selector Persona Locataria */
  document.addEventListener("DOMContentLoaded", function () {
    // Get the select element
    var selectElement = document.getElementById("PersonasLocatario");

    // Function to show/hide the correct divs based on the selected value
    function toggleDivs() {
      // First, hide all the divs
      document.getElementById("Locataria-1-persona").style.display = "none";
      document.getElementById("Locataria-2-persona").style.display = "none";
      document.getElementById("Locataria-3-persona").style.display = "none";
      document.getElementById("Locataria-4-persona").style.display = "none";
      document.getElementById("Locataria-5-persona").style.display = "none";

      // Get the selected number of people
      var selectedValue = selectElement.value;
      var numPeople = parseInt(selectedValue.charAt(0)); // Get the number (1-5)

      // Show the divs based on the number of people selected
      for (var i = 1; i <= numPeople; i++) {
        document.getElementById("Locataria-" + i + "-persona").style.display =
          "block";
      }
    }

    // Attach the change event listener to the select element
    selectElement.addEventListener("change", toggleDivs);

    // Initial check in case there's a default value selected
    toggleDivs();
  });

  /* Selector estado civil */
  document.addEventListener("DOMContentLoaded", function () {
    // Function to show/hide the "nupcias" div based on the selected value of a given pair of elements
    function toggleNupciasDiv(estadoCivilId, nupciasId) {
      var estadoCivilElement = document.getElementById(estadoCivilId);
      var nupciasDiv = document.getElementById(nupciasId);

      // Function to show/hide the nupcias div based on the selected value
      function updateNupciasVisibility() {
        var selectedEstadoCivil = estadoCivilElement.value;
        if (selectedEstadoCivil === "casado/a") {
          nupciasDiv.style.display = "block";
        } else {
          nupciasDiv.style.display = "none";
        }
      }

      // Attach the change event listener to the estado civil select element
      estadoCivilElement.addEventListener("change", updateNupciasVisibility);

      // Initial check to hide/show the div on page load based on the default value
      updateNupciasVisibility();
    }

    // Locador: Call the toggleNupciasDiv function for each pair of Locador elements (up to 5)
    toggleNupciasDiv("estadocivilLocadorPF1", "nupciasLocador1");
    toggleNupciasDiv("estadocivilLocadorPF2", "nupciasLocador2");
    toggleNupciasDiv("estadocivilLocadorPF3", "nupciasLocador3");
    toggleNupciasDiv("estadocivilLocadorPF4", "nupciasLocador4");
    toggleNupciasDiv("estadocivilLocadorPF5", "nupciasLocador5");

    // Locatario: Call the toggleNupciasDiv function for each pair of Locatario elements (up to 5)
    toggleNupciasDiv("estadocivilLocatarioPF1", "nupciasLocatario1");
    toggleNupciasDiv("estadocivilLocatarioPF2", "nupciasLocatario2");
    toggleNupciasDiv("estadocivilLocatarioPF3", "nupciasLocatario3");
    toggleNupciasDiv("estadocivilLocatarioPF4", "nupciasLocatario4");
    toggleNupciasDiv("estadocivilLocatarioPF5", "nupciasLocatario5");

    // Garante: Call the toggleNupciasDiv function for each pair of Garante elements (up to 3)
    toggleNupciasDiv("estadocivilGarantePF1", "nupciasGarante1");
    toggleNupciasDiv("estadocivilGarantePF2", "nupciasGarante2");
    toggleNupciasDiv("estadocivilGarantePF3", "nupciasGarante3");
  });

  /* formatter canonDePagoLocacion */
  window.onload = function () {
    // Number-to-words map extended for larger numbers (thousands and millions)
    const numberWords = {
      0: "Cero",
      1: "Uno",
      2: "Dos",
      3: "Tres",
      4: "Cuatro",
      5: "Cinco",
      6: "Seis",
      7: "Siete",
      8: "Ocho",
      9: "Nueve",
      10: "Diez",
      11: "Once",
      12: "Doce",
      13: "Trece",
      14: "Catorce",
      15: "Quince",
      16: "Dieciséis",
      17: "Diecisiete",
      18: "Dieciocho",
      19: "Diecinueve",
      20: "Veinte",
      30: "Treinta",
      40: "Cuarenta",
      50: "Cincuenta",
      60: "Sesenta",
      70: "Setenta",
      80: "Ochenta",
      90: "Noventa",
      100: "Cien",
      200: "Doscientos",
      300: "Trescientos",
      400: "Cuatrocientos",
      500: "Quinientos",
      600: "Seiscientos",
      700: "Setecientos",
      800: "Ochocientos",
      900: "Novecientos",
      1000: "Mil",
    };

    // Function to convert a number into Spanish words
    function numberToWords(num) {
      if (num < 100) {
        return numberWords[num] || "";
      }
      if (num < 200) {
        // Handle hundreds from 100 to 199
        let remainder = num % 100;
        return remainder === 0
          ? "Ciento"
          : `Ciento ${numberToWords(remainder)}`;
      }
      if (num < 1000) {
        // Handle hundreds from 200 to 999
        let hundreds = Math.floor(num / 100) * 100;
        let remainder = num % 100;
        return remainder === 0
          ? numberWords[hundreds]
          : `${numberWords[hundreds]} ${numberToWords(remainder)}`;
      }
      if (num < 1000000) {
        // Handle thousands
        let thousands = Math.floor(num / 1000);
        let remainder = num % 1000;
        let thousandsWord =
          thousands === 1 ? "Mil" : `${numberToWords(thousands)} mil`;
        return remainder === 0
          ? thousandsWord
          : `${thousandsWord} ${numberToWords(remainder)}`;
      }
      if (num >= 1000000) {
        // Handle millions
        let millions = Math.floor(num / 1000000);
        let remainder = num % 1000000;
        let millionsWord =
          millions === 1 ? "Un millón" : `${numberToWords(millions)} millones`;
        return remainder === 0
          ? millionsWord
          : `${millionsWord} ${numberToWords(remainder)}`;
      }
      return ""; // Return empty string for unhandled cases
    }

    // Function to format the canon de pago locacion value and send it to the backend
    function formatCanonDePagoLocacion() {
      const inputField = document.getElementById("canonDePagoLocacion");
      const hiddenField = document.getElementById("formatted-canon-hidden");

      // Get the user's input and parse it as a number
      const number = parseInt(inputField.value, 10);

      if (!isNaN(number)) {
        // Convert the number to words
        const numberInWords = numberToWords(number);

        // Create the formatted string to send to the backend (only the words)
        hiddenField.value = numberInWords;

        // Create and dispatch an input event to notify other scripts
        const event = new Event("input", { bubbles: true });
        hiddenField.dispatchEvent(event);

        console.log("Formatted canon de pago:", numberInWords); // For debugging purposes
      } else {
        hiddenField.value = "";
        console.log("Invalid number input:", inputField.value); // For debugging purposes
      }
    }

    // Function to format the sumaDepositoGarantiaLocacion value and send it to the backend
    function formatSumaDepositoGarantiaLocacion() {
      const inputField = document.getElementById(
        "sumaDepositoGarantiaLocacion"
      );
      const hiddenField = document.getElementById(
        "hiddensumaDepositoGarantiaLocacion"
      );

      // Get the user's input and parse it as a number
      const number = parseInt(inputField.value, 10);

      if (!isNaN(number)) {
        // Convert the number to words
        const numberInWords = numberToWords(number);

        // Create the formatted string to send to the backend (only the words)
        hiddenField.value = numberInWords;

        // Create and dispatch an input event to notify other scripts
        const event = new Event("input", { bubbles: true });
        hiddenField.dispatchEvent(event);

        console.log("Formatted suma deposito garantia:", numberInWords); // For debugging purposes
      } else {
        hiddenField.value = "";
        console.log("Invalid number input:", inputField.value); // For debugging purposes
      }
    }

    // Listen for changes in the 'canonDePagoLocacion' input field
    document
      .getElementById("canonDePagoLocacion")
      .addEventListener("input", formatCanonDePagoLocacion);

    // Listen for changes in the 'sumaDepositoGarantiaLocacion' input field
    document
      .getElementById("sumaDepositoGarantiaLocacion")
      .addEventListener("input", formatSumaDepositoGarantiaLocacion);

    // Listen for form submission to ensure the formatted values are updated before sending
    document
      .getElementById("canon-form")
      .addEventListener("submit", function (event) {
        formatCanonDePagoLocacion(); // Ensure the latest value for canon de pago
        formatSumaDepositoGarantiaLocacion(); // Ensure the latest value for suma deposito garantia
      });
  };

  /* Helper function to format dates for the signature date: "6 de noviembre de 2024" */
  function formatSignatureDate(date) {
    const months = [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",

      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ];

    const day = date.getDate();

    const month = months[date.getMonth()];

    const year = date.getFullYear();

    return `${day} de ${month} de ${year}`;
  }

  // Function to set today's date as the signature date in the specified format

  function setTodaySignatureDate() {
    const today = new Date();

    const formattedDate = formatSignatureDate(today);

    document.getElementById("signature-date").textContent = formattedDate;

    updateSignatureHiddenInput(
      "formatted-signature-forward-date",
      formattedDate
    );
  }

  // Function to simulate user input event and update the hidden input

  function updateSignatureHiddenInput(inputId, value) {
    const hiddenInput = document.getElementById(inputId);

    hiddenInput.value = value;

    const event = new Event("input", { bubbles: true });

    hiddenInput.dispatchEvent(event); // Simulates a user input event
  }

  // Event listener for the signature date selector

  document
    .getElementById("signature-date-selector")
    .addEventListener("change", function (event) {
      const selectedOption = event.target.value;

      if (selectedOption === "today") {
        // Set the signature date as today

        document.getElementById("Fecha-firma-locacion-vivienda").style.display =
          "none";

        setTodaySignatureDate();
      } else if (selectedOption === "next") {
        // Show the custom signature date input field

        document.getElementById("Fecha-firma-locacion-vivienda").style.display =
          "block";
      }
    });

  // Event listener for the custom signature date input with one-day addition

  document
    .getElementById("custom-signature-date")
    .addEventListener("change", function (event) {
      const selectedDate = new Date(event.target.value);

      selectedDate.setDate(selectedDate.getDate() + 1); // Add one day to the selected date

      const formattedDate = formatSignatureDate(selectedDate);

      // Update the signature date display and hidden input

      document.getElementById("signature-date").textContent = formattedDate;

      updateSignatureHiddenInput(
        "formatted-signature-forward-date",
        formattedDate
      );
    });

  // Initialize with today's date if the page loads with "today" option selected for signature date

  if (document.getElementById("signature-date-selector").value === "today") {
    setTodaySignatureDate();
  }

  return new NextResponse(frontendCode, {
    status: 200,
    headers: headers,
  });
}
