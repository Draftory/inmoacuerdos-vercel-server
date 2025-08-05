<script>
document.addEventListener('DOMContentLoaded', function() {
    const caucionCheckbox = document.querySelector('input[name="caucion"]');
    const pagareCheckbox = document.querySelector('input[name="pagare"]');
    const garantesCheckbox = document.querySelector('input[name="garantes"]');

    const seguroCaucionElement = document.getElementById('incluye-seguro-de-caucion');
    const pagareElement = document.getElementById('Incluye-pagare');
    const garanteElement = document.getElementById('incluye-garante');
    const personaGaranteElement = document.getElementById('Div-persona-garante');

    // Función para mostrar/ocultar elementos basada en el estado del checkbox
    // Si el checkbox está marcado, el elemento se muestra ('block'); de lo contrario, se oculta ('none').
    function toggleElementVisibility(checkbox, element) {
        if (checkbox && element) {
            element.style.display = checkbox.checked ? 'block' : 'none';
        }
    }

    // Función para establecer la visibilidad inicial de todos los elementos
    function setInitialVisibility() {
        toggleElementVisibility(caucionCheckbox, seguroCaucionElement);
        toggleElementVisibility(pagareCheckbox, pagareElement);
        toggleElementVisibility(garantesCheckbox, garanteElement);
        toggleElementVisibility(garantesCheckbox, personaGaranteElement);
        
        // Update placeholder visibility on initial load with a small delay
        setTimeout(() => {
            if (typeof updateSpecificPlaceholder === 'function') {
                updateSpecificPlaceholder('caucion', null);
                updateSpecificPlaceholder('pagare', null);
                updateSpecificPlaceholder('garantes', null);
            }
        }, 100);
    }

    // Event listeners para los checkboxes
    if (caucionCheckbox) {
        caucionCheckbox.addEventListener('change', function() {
            toggleElementVisibility(caucionCheckbox, seguroCaucionElement);
            // Update the placeholder visibility when checkbox changes
            if (typeof updateSpecificPlaceholder === 'function') {
                updateSpecificPlaceholder('caucion', null);
            }
        });
    }

    if (pagareCheckbox) {
        pagareCheckbox.addEventListener('change', function() {
            toggleElementVisibility(pagareCheckbox, pagareElement);
            // Update the placeholder visibility when checkbox changes
            if (typeof updateSpecificPlaceholder === 'function') {
                updateSpecificPlaceholder('pagare', null);
            }
        });
    }

    if (garantesCheckbox) {
        garantesCheckbox.addEventListener('change', function() {
            toggleElementVisibility(garantesCheckbox, garanteElement);
            toggleElementVisibility(garantesCheckbox, personaGaranteElement);
            // Update the placeholder visibility when checkbox changes
            if (typeof updateSpecificPlaceholder === 'function') {
                updateSpecificPlaceholder('garantes', null);
            }
        });
    }

    // **Llamada inicial para establecer el estado correcto al cargar la página**
    // Con esta configuración, si el checkbox NO está marcado por defecto, el elemento se ocultará.
    // Si el checkbox SÍ está marcado por defecto, el elemento se mostrará.
    // Asegúrate de que tus elementos en Webflow tengan 'display: none' como estilo inicial.
    setInitialVisibility();

    // También ejecutar la visibilidad cuando se cargan datos del formulario (para drafts)
    document.addEventListener('formDataLoaded', function() {
        // Add a small delay to ensure the checkbox values are properly set
        setTimeout(() => {
            setInitialVisibility();
        }, 100);
    });
});
</script>

<script>
document.addEventListener('DOMContentLoaded', function() {
  const dependenciasProvinciaCiudad = [
    { provinciaSelectName: 'provinciaLocatarioPF1', ciudadDivId: 'divCiudadLocatarioPF1' },
    { provinciaSelectName: 'provinciaLocadorPF1', ciudadDivId: 'divCiudadLocadorPF1' },
    { provinciaSelectName: 'provinciaLocadorApoderadoPF1', ciudadDivId: 'divCiudadLocadorApoderadoPF1' },
    { provinciaSelectName: 'provinciaLocadorPJ1', ciudadDivId: 'divCiudadLocadorPJ1' },
    { provinciaSelectName: 'provinciaRepresentanteLocadorPJ1', ciudadDivId: 'divCiudadRepresentanteLocadorPJ1' },
    { provinciaSelectName: 'provinciaLocadorPF2', ciudadDivId: 'divCiudadLocadorPF2' },
    { provinciaSelectName: 'provinciaLocadorApoderadoPF2', ciudadDivId: 'divCiudadLocadorApoderadoPF2' },
    { provinciaSelectName: 'provinciaLocadorPJ2', ciudadDivId: 'divCiudadLocadorPJ2' },
    { provinciaSelectName: 'provinciaRepresentanteLocadorPJ2', ciudadDivId: 'divCiudadRepresentanteLocadorPJ2' },
    { provinciaSelectName: 'provinciaLocatarioApoderadoPF1', ciudadDivId: 'divCiudadLocatarioApoderadoPF1' },
    { provinciaSelectName: 'provinciaLocatarioPJ1', ciudadDivId: 'divCiudadLocatarioPJ1' },
    { provinciaSelectName: 'provinciaRepresentanteLocatarioPJ1', ciudadDivId: 'divCiudadRepresentanteLocatarioPJ1' },
    { provinciaSelectName: 'provinciaLocatarioPF2', ciudadDivId: 'divCiudadLocatarioPF2' },
    { provinciaSelectName: 'provinciaLocatarioApoderadoPF2', ciudadDivId: 'divCiudadLocatarioApoderadoPF2' },
    { provinciaSelectName: 'provinciaLocatarioPJ2', ciudadDivId: 'divCiudadLocatarioPJ2' },
    { provinciaSelectName: 'provinciaRepresentanteLocatarioPJ2', ciudadDivId: 'divCiudadRepresentanteLocatarioPJ2' },
    { provinciaSelectName: 'provinciaLocatarioPF3', ciudadDivId: 'divCiudadLocatarioPF3' },
    { provinciaSelectName: 'provinciaLocatarioApoderadoPF3', ciudadDivId: 'divCiudadLocatarioApoderadoPF3' },
    { provinciaSelectName: 'provinciaLocatarioPJ3', ciudadDivId: 'divCiudadLocatarioPJ3' },
    { provinciaSelectName: 'provinciaRepresentanteLocatarioPJ3', ciudadDivId: 'divCiudadRepresentanteLocatarioPJ3' },
    { provinciaSelectName: 'provinciaInmuebleLocado', ciudadDivId: 'divCiudadInmuebleLocado' },
    { provinciaSelectName: 'provinciaGarantePF1', ciudadDivId: 'divCiudadGarantePF1' },
    { provinciaSelectName: 'provinciaGaranteApoderadoPF1', ciudadDivId: 'divCiudadGaranteApoderadoPF1' },
    { provinciaSelectName: 'provinciaGarantePJ1', ciudadDivId: 'divCiudadGarantePJ1' },
    { provinciaSelectName: 'provinciaRepresentanteGarantePJ1', ciudadDivId: 'divCiudadRepresentanteGarantePJ1' },
    { provinciaSelectName: 'provinciaGarantePF2', ciudadDivId: 'divCiudadGarantePF2' },
    { provinciaSelectName: 'provinciaGaranteApoderadoPF2', ciudadDivId: 'divCiudadGaranteApoderadoPF2' },
    { provinciaSelectName: 'provinciaGarantePJ2', ciudadDivId: 'divCiudadGarantePJ2' },
    { provinciaSelectName: 'provinciaRepresentanteGarantePJ2', ciudadDivId: 'divCiudadRepresentanteGarantePJ2' },
    { provinciaSelectName: 'garanteP1PropiedadProvincia', ciudadDivId: 'divGaranteP1PropiedadCiudad' },
    { provinciaSelectName: 'garanteP2PropiedadProvincia', ciudadDivId: 'divGaranteP2PropiedadCiudad' },
    { provinciaSelectName: 'provinciaLocadorPF3', ciudadDivId: 'divCiudadLocadorPF3' },
    { provinciaSelectName: 'provinciaLocadorApoderadoPF3', ciudadDivId: 'divCiudadLocadorApoderadoPF3' },
    { provinciaSelectName: 'provinciaLocadorPJ3', ciudadDivId: 'divCiudadLocadorPJ3' },
    { provinciaSelectName: 'provinciaRepresentanteLocadorPJ3', ciudadDivId: 'divCiudadRepresentanteLocadorPJ3' }
  ];

  function actualizarVisibilidadCiudad(provinciaSelect, ciudadDiv) {
    if (provinciaSelect.value === 'Ciudad Autónoma de Buenos Aires') {
      ciudadDiv.style.display = 'none';
    } else {
      ciudadDiv.style.display = 'block'; // O 'flex', 'grid'
    }
  }

  dependenciasProvinciaCiudad.forEach(function(dependencia) {
    const provinciaSelect = document.querySelector(`select[name="${dependencia.provinciaSelectName}"]`);
    const ciudadDiv = document.getElementById(dependencia.ciudadDivId);

    if (provinciaSelect && ciudadDiv) {
      // Oculta el div de ciudad por defecto
      ciudadDiv.style.display = 'none';

      // Llama a la función inicialmente para establecer la visibilidad correcta al cargar
      // SOLO si los elementos existen
      actualizarVisibilidadCiudad(provinciaSelect, ciudadDiv);

      // Agrega el listener para cambios en el select
      provinciaSelect.addEventListener('change', function() {
        actualizarVisibilidadCiudad(provinciaSelect, ciudadDiv);
      });
    } else {
      console.warn(`No se encontraron los elementos con name="${dependencia.provinciaSelectName}" o id="${dependencia.ciudadDivId}"`);
    }
  });
});
</script>

<!-- 💙 MEMBERSCRIPT #51 v0.2 💙 DISPLAY MEMBER METADATA -->
<script>
  function replaceTextWithMetadata(metadata) {
    var els = Array.from(document.querySelectorAll('[ms-code-member-meta]'));
    els.forEach((el) => {
      const key = el.getAttribute('ms-code-member-meta');
      const value = metadata[key];
      if (value !== undefined) {
        el.innerHTML = value;
        el.value = value;
        el.src = value;
      }
    });
  }

  const memberstack = window.$memberstackDom;
  memberstack.getCurrentMember()
    .then(({ data: member }) => {
      if (member && member.metaData) {
        replaceTextWithMetadata(member.metaData);
      }
    })
    .catch((error) => {
      console.error('Error retrieving member data:', error);
    });
</script>

<script>
// Function to generate a unique contract ID using UUID
function generateUniqueContractID() {
    return uuidv4(); // Usa la función global proporcionada por el CDN
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
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false // Explicitly disable 12-hour format
    }).replace(/\./g, '/'); // Reemplaza los puntos por barras para el formato dd/mm/aaaa
}

// Script 2: Función saveContractVersion (global)
async function saveContractVersion(event, status, redirectUrl = "/success") {
    if (event) event.preventDefault();

    const formElement = document.querySelector('form[name="wf-form-1-00---Locacion-de-vivienda"]');
    if (!formElement) {
        console.error('Error: Formulario no encontrado en saveContractVersion.');
        return;
    }
    
    const formObject = {};
    const formElements = formElement.elements;
    
    for (let i = 0; i < formElements.length; i++) {
        const element = formElements[i];
        if (element.name && element.name.trim() !== '') {
            if (element.type === 'checkbox') {
                if (element.checked) {
                    formObject[element.name] = element.value || true;
                }
            } else if (element.type === 'radio') {
                if (element.checked) {
                    formObject[element.name] = element.value;
                }
            } else {
                formObject[element.name] = element.value;
            }
        }
    }

    const camposRequeridos = formElement.querySelectorAll('input[required], select[required], textarea[required]');

    let todosCompletos = true;

    camposRequeridos.forEach(campo => {
        if (campo.type === 'radio') {
            const radioGroup = formElement.querySelectorAll(`input[type="radio"][name="${campo.name}"]`);
            let radioSelected = false;
            radioGroup.forEach(radio => {
                if (radio.checked) {
                    radioSelected = true;
                }
            });
            if (!radioSelected) {
                todosCompletos = false;
                console.error(`El grupo de radio buttons "${campo.name}" es obligatorio.`);
                if (radioGroup.length > 0) {
                    radioGroup[0].classList.add('error-requerido');
                }
            } else {
                radioGroup.forEach(radio => radio.classList.remove('error-requerido'));
            }
        } else if (campo.type === 'checkbox') {
            if (!campo.checked) {
                todosCompletos = false;
                console.error(`El campo "${campo.name}" es obligatorio.`);
                campo.classList.add('error-requerido');
            } else {
                campo.classList.remove('error-requerido');
            }
        } else if (!campo.value.trim()) {
            todosCompletos = false;
            console.error(`El campo "${campo.name}" es obligatorio.`);
            campo.classList.add('error-requerido');
        } else {
            campo.classList.remove('error-requerido');
        }
    });

    if (!todosCompletos) {
        alert('Por favor, completa todos los campos obligatorios.');
        return;
    }

    if (!formObject.contractID) {
        alert("No contract ID found. Por favor, interactúa con el formulario para generar un ID.");
        return;
    }

    formObject.draftVersion = parseInt(formObject.draftVersion) || 1;
    formObject.status = status;
    formElement.querySelector("input[name='status']").value = status;
    if (typeof getBuenosAiresTimestamp === 'function') {
        formObject.timestamp = getBuenosAiresTimestamp(); 
    } else {
        console.warn('getBuenosAiresTimestamp() no está definido. Usando new Date().toISOString()');
        formObject.timestamp = new Date().toISOString();
    }

    console.log("Form Object (Client-Side):", formObject);

    try {
        const serverUrl = "https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-post-draft-final";

        const response = await fetch(serverUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(formObject),
        });

        if (response.ok) {
            // *** ¡Aquí la invocación a la función del otro script! ***
            // Verifica que la función global exista antes de llamarla
            if (typeof window.clearAndReloadForm === 'function') {
                window.clearAndReloadForm(); 
            } else {
                console.error('Error: clearAndReloadForm no está definida o no es accesible.');
                // En caso de que no se pueda recargar, al menos informa.
                alert('Guardado exitoso, pero no se pudo reiniciar el formulario. Recargue manualmente si lo desea.');
            }
            
            const result = await response.json();
            if (status === "Contrato") {
                // Si la URL es diferente, esto podría "ganar" a la recarga de clearAndReloadForm
                window.location.href = redirectUrl; 
            } else if (status === "Borrador") {
                alert("Guardado como borrador. Redirigiendo..."); 
                const loginRedirectButton = document.querySelector('#mis-contratos[data-ms-action="login-redirect"]');
                if (loginRedirectButton) {
                    loginRedirectButton.click();
                } else {
                    console.warn('No se encontró el botón con id="#mis-contratos" y data-ms-action="login-redirect". Redirigiendo a /success por defecto.');
                    window.location.href = "/success";
                }
            }
            formElement.querySelector("input[name='draftVersion']").value = formObject.draftVersion + 1;

        } else {
            console.error("Error guardando " + status + ":", response.statusText);
            alert("Error guardando " + status + ".");
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Error guardando " + status + ".");
    }
}

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
                console.error("contractID is missing from the URL or memberstackID could not be retrieved.");
            }
        } else {
            console.error("User is not logged in or Memberstack object not available.");
        }
    });
}

async function fetchDraftData(contractID, memberstackID) {
    try {
        const draftServerUrl = `https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-edit-contract`;
        const response = await fetch(draftServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contractID: contractID, memberstackID: memberstackID }),
        });

        if (response.ok) {
            const draftData = await response.json();
            if (draftData) {
                const form = document.querySelector('form');

                for (const key in draftData) {
                    const value = draftData[key];
                    const inputFields = form.querySelectorAll(`[name="${key}"]`);

                    if (inputFields.length > 0) {
                        inputFields.forEach(inputField => {
                            if (inputField.type === 'radio') {
                                if (inputField.value === value) {
                                    inputField.checked = true;
                                    // Update Webflow visual state for radios
                                    const radios = document.querySelectorAll(`input[type="radio"][name="${inputField.name}"]`);
                                    radios.forEach(radio => {
                                        const radioDiv = radio.closest('label').querySelector('.w-form-formradioinput');
                                        if (radioDiv) radioDiv.classList.remove('w--redirected-checked');
                                    });
                                    const radioDiv = inputField.closest('label').querySelector('.w-form-formradioinput');
                                    if (radioDiv) radioDiv.classList.add('w--redirected-checked');
                                    inputField.dispatchEvent(new Event('change'));
                                }
                            } else if (inputField.type === 'checkbox') {
                                const shouldBeChecked = value === true || value === "true" || value === "on";
                                inputField.checked = shouldBeChecked;
                                // Update Webflow visual state for checkboxes
                                const checkboxDiv = inputField.closest('label').querySelector('.w-checkbox-input');
                                if (checkboxDiv) {
                                    if (shouldBeChecked) {
                                        checkboxDiv.classList.add('w--redirected-checked');
                                    } else {
                                        checkboxDiv.classList.remove('w--redirected-checked');
                                    }
                                }
                                inputField.dispatchEvent(new Event('change'));
                            } else if (inputField.type === 'select-one') {
                                inputField.value = value;
                            } else {
                                inputField.value = value || '';
                            }
                        });
                    }
                }
                document.dispatchEvent(new Event('formDataLoaded'));
            } else {
                console.log("No draft data found for contractID:", contractID, "and memberstackID:", memberstackID);
            }
        } else {
            console.error("Error fetching draft data:", response.statusText);
        }
    } catch (error) {
        console.error("Error fetching draft data:", error);
    }
}

// Call the prefill function when the page loads
document.addEventListener('DOMContentLoaded', prefillFormFromUrl);

// Event listener for the "Finalizar" button (which is also .save-as-final-btn)
document.addEventListener('DOMContentLoaded', function () {
    const finalizarBtn = document.querySelector('#boton-finalizar.save-as-final-btn'); // Combined selector

    if (finalizarBtn) {
        finalizarBtn.addEventListener('click', function (event) {
            const contractID = document.querySelector('[name="contractID"]').value;
            const Contrato = document.querySelector('[name="Contrato"]').value;
            const MemberstackIDInput = document.querySelector('[name="MemberstackID"]');
            const MemberstackID = MemberstackIDInput ? MemberstackIDInput.value : '';

            let urlPago = `https://www.inmoacuerdos.com/editor-documentos/payment?contractID=${encodeURIComponent(contractID)}&Contrato=${encodeURIComponent(Contrato)}`;
            if (MemberstackID) {
                urlPago += `&MemberstackID=${encodeURIComponent(MemberstackID)}`;
            }
            saveContractVersion(event, "Contrato", urlPago);
        });
    } else {
        console.error('No se encontró el botón #boton-finalizar.save-as-final-btn');
    }
});

// Event listener for the "Guardar como borrador" button (.save-as-draft-btn)
document.addEventListener('DOMContentLoaded', function () {
    const guardarBorradorBtn = document.querySelector('.save-as-draft-btn');

    if (guardarBorradorBtn) {
        guardarBorradorBtn.addEventListener('click', function (event) {
            saveContractVersion(event, "Borrador"); // Llama a la función con status "Borrador"
        });
    } else {
        console.error('No se encontró el botón .save-as-draft-btn');
    }
});

document.addEventListener('DOMContentLoaded', function () {
    const tipoGarantiaSelect = document.getElementById('tipo_garantia');
    const otroGarantiaInput = document.getElementById('otro_garantia_input');

    tipoGarantiaSelect.addEventListener('change', function () {
        if (this.value === 'otro') {
            otroGarantiaInput.style.display = 'block';
        } else {
            otroGarantiaInput.style.display = 'none';
        }
    });
});
</script>

<script>
 document.addEventListener("DOMContentLoaded", function () {
  const steps = document.querySelectorAll('.form_step');
  const nextButtons = document.querySelectorAll('.is-next');
  const prevButtons = document.querySelectorAll('.is-prev');
  const saveAsFinalButton = document.querySelector('.save-as-final-btn');
  const progressBarInner = document.querySelector('.progress_bar-inner');
  const messageElement = document.querySelector('.h5.message');
  const formBlock = document.querySelector('.form_block');

  let currentStep = 0;

  function scrollToTop() {
    formBlock.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  function showStep(step) {
    steps.forEach((stepElement, index) => {
      stepElement.style.display = (index === step) ? 'flex' : 'none';
    });

    if (step === steps.length - 1) {
      nextButtons.forEach(button => button.style.display = 'none');
      prevButtons.forEach(button => button.style.display = 'flex');
      saveAsFinalButton.style.display = 'flex'; // Change to flex here
    } else {
      nextButtons.forEach(button => button.style.display = 'flex');
      prevButtons.forEach(button => button.style.display = (step > 0) ? 'flex' : 'none');
      saveAsFinalButton.style.display = 'none';
    }

    const progressPercentage = ((step + 1) / steps.length) * 100;
    progressBarInner.style.width = `${progressPercentage}%`;

    scrollToTop();
  }

  function validateStep(step) {
    const inputs = steps[step].querySelectorAll('input[required], select[required], textarea[required]');
    let valid = true;

    inputs.forEach(input => {
      if (input.type === 'radio') {
        const radioGroup = steps[step].querySelectorAll(`input[name="${input.name}"]`);
        const checked = Array.from(radioGroup).some(radio => radio.checked);
        if (!checked) {
          valid = false;
        }
      } else if (!input.value) {
        valid = false;
      }
    });

    if (!valid) {
      messageElement.textContent = "Por favor completar los campos obligatorios.";
    } else {
      messageElement.textContent = "";
    }

    return valid;
  }

  showStep(currentStep);

  nextButtons.forEach(button => {
    button.addEventListener('click', function () {
      if (validateStep(currentStep)) {
        if (currentStep < steps.length - 1) {
          currentStep++;
          showStep(currentStep);
        }
      }
    });
  });

  prevButtons.forEach(button => {
    button.addEventListener('click', function () {
      if (currentStep > 0) {
        currentStep--;
        showStep(currentStep);
      }
    });
  });
});
</script>

<script>
// List of placeholders that should be hidden and not replaced until the user provides input
 const hiddenPlaceholders = [
  "nupciasLocadorPF1",
  "conyugeLocadorPF1",
  "nupciasLocadorPF2",
  "conyugeLocadorPF2",
  "nupciasLocadorPF3",
  "conyugeLocadorPF3",
  "nupciasLocatarioPF1",
  "conyugeLocatarioPF1",
  "nupciasLocatarioPF2",
  "conyugeLocatarioPF2",
  "nupciasLocatarioPF3",
  "conyugeLocatarioPF3",
  "nupciasGarantePF1",
  "conyugeGarantePF1",
  "nupciasGarantePF2",
  "conyugeGarantePF2",
  "clausulaAdicional",
  "locadorRepresentacionPF1",
  "locadorRepresentacionPF2",
  "locadorRepresentacionPF3",
  "locatarioRepresentacionPF1",
  "locatarioRepresentacionPF2",
  "locatarioRepresentacionPF3",
  "garanteRepresentacionPF1",
  "garanteRepresentacionPF2",
  "descripcionInmuebleLocado",
  "locacionAmoblado",
  "adjuntaFotosLocacionAmoblado",
  "locacionCochera",
  "locacionBaulera",
  "caucion",
  "pagare",
  "garantes",
  "aclaracionesProhibicionesLocacion",
 ];

 // Global variable to store fetched clauses
 let cachedClauses = [];

 // To store the previous selected value for radio button groups
 let previousRadioSelections = {};

 // Flag to track if the page has loaded
 let pageLoaded = false;

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

 async function updateSpecificPlaceholder(placeholderKey, event, options = {}) {
  console.log(`[updateSpecificPlaceholder] Called for:`, { placeholderKey, event, options });

  if (options.clausePlaceholders && !options.clausePlaceholders.includes(placeholderKey)) {
    console.log(`[updateSpecificPlaceholder] Skipping ${placeholderKey} (not in clausePlaceholders)`);
    return;
  }

  const correspondingInputs = document.getElementsByName(placeholderKey);
  if (!correspondingInputs || correspondingInputs.length === 0) {
    console.log(`[updateSpecificPlaceholder] No inputs found for ${placeholderKey}`);
    return;
  }

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
      console.log(`[updateSpecificPlaceholder] Clearing previous selection for ${placeholderKey}: ${previousRadioSelections[placeholderKey]}`);
      clearPlaceholdersForPreviousSelection(previousRadioSelections[placeholderKey]);
    }
    previousRadioSelections[placeholderKey] = inputValue;
  } else {
    inputValue = correspondingInputs[0].value || "";
  }

  let clauseText = "";
  let foundEmptyClause = false;
  if (inputValue !== "") {
    for (const row of cachedClauses) {
      const [placeholderName, clauseDefinition, clause] = row;
      if (placeholderName === placeholderKey && clauseDefinition === inputValue) {
        if (clause && clause.trim() !== "") {
          clauseText = formatPlaceholdersForClauses(clause);
          console.log(`[updateSpecificPlaceholder] Found clause for ${placeholderKey}:`, clauseText);
        } else {
          foundEmptyClause = true;
          console.log(`[updateSpecificPlaceholder] Found empty clause for ${placeholderKey}`);
        }
        break;
      }
    }
  }

  const placeholderElements = document.querySelectorAll(
    `.preview-placeholder[data-placeholder="${placeholderKey}"]`
  );
  let scrolled = false;
  placeholderElements.forEach((placeholderElement) => {
    if (foundEmptyClause) {
      console.log(`[updateSpecificPlaceholder] Hiding placeholder ${placeholderKey} because foundEmptyClause`);
      placeholderElement.style.display = 'none';
      return;
    }
    
    // Special handling for hidden placeholders - hide them when they have no value
    if (hiddenPlaceholders.includes(placeholderKey) && !inputValue) {
      console.log(`[updateSpecificPlaceholder] Hiding hidden placeholder ${placeholderKey} because no value`);
      placeholderElement.style.display = 'none';
      return;
    }
    
    if (placeholderElement.style.display === 'none') {
      console.log(`[updateSpecificPlaceholder] Showing placeholder ${placeholderKey}`);
    }
    placeholderElement.style.display = 'inline';
    if (!clauseText && !inputValue) {
      placeholderElement.innerHTML = "_________";
      console.log(`[updateSpecificPlaceholder] Setting blank for ${placeholderKey}`);
    } else if (clauseText) {
      placeholderElement.innerHTML = `<span style=\"color: #5c9bff;\">${clauseText}</span>`;
      console.log(`[updateSpecificPlaceholder] Setting clause for ${placeholderKey}:`, clauseText);
    } else {
      placeholderElement.innerHTML = `<span style=\"font-weight: bold; color: var(--untitled-ui--primary600);\">${inputValue}</span>`;
      console.log(`[updateSpecificPlaceholder] Setting user input for ${placeholderKey}:`, inputValue);
    }
    // Only scroll if triggered by user event, the element is visible, and we haven't scrolled yet
    if (
      event &&
      !scrolled &&
      placeholderElement.offsetParent !== null // visible (not display:none)
    ) {
      setTimeout(() => {
        placeholderElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      scrolled = true;
    }
  });
 }

 function clearPlaceholdersForPreviousSelection(previousValue) {
  // Disabled to prevent hiding placeholders by substring match (e.g., 'no' hides nombreLocadorPF1)
  // To fix properly, track which placeholders are added for each radio value and only hide those.
  // For now, do nothing to prevent the bug.
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
        element.addEventListener("input", (event) => {
          updateSpecificPlaceholder(element.name, event);
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
  pageLoaded = true; // Set the flag after initial load
 }

 document.addEventListener("DOMContentLoaded", async () => {
  await fetchClausesFromSheet();
  await updatePlaceholdersOnLoad();
  addEventListenersToInputs();
 });

 // Listen for the formDataLoaded event
 document.addEventListener("formDataLoaded", async () => {
  await updatePlaceholdersOnLoad();
  addEventListenersToInputs(); // Attach listeners after prefill
 });
</script>
 
<script>
document.addEventListener("DOMContentLoaded", function() {
    const unidadPlazo = document.getElementById("inputLocacionUnidadPlazo");
    const cantidadUnidad = document.getElementById("inputLocacionCantidadUnidad");
    const comienzoSelector = document.getElementById("inputSelectorLocacionComienz");
    const customStartDate = document.getElementById("custom-start-date");
    const fechaInicioDiv = document.getElementById("Fecha-inicio-locacion-vivienda");
    const fechaTerminoDiv = document.getElementById("mostrarFechaTerminoLocacion");
    const hiddenInputFechaInicio = document.getElementById("hiddenInputLocacionFechaInicio");
    const hiddenInputFechaTermino = document.getElementById("hiddenInputLocacionFechaTermino");
    const hiddenInputPlazo = document.getElementById("hiddenInputLocacionPlazo");

    function numberToSpanishWords(num, units) {
        const ones = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
        const teens = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
        const tens = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];

        if (num === 1 && units === "días") return "un";
        if (num === 1 && units === "año") return "un";
        if (num === 1 && units === "mes") return "un";
        
        if (num < 10) return ones[num];
        else if (num < 20) return teens[num - 10];
        else if (num < 30) return num === 20 ? "veinte" : "veinti" + ones[num - 20];
        else if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? " y " + ones[num % 10] : "");
        else if (num < 1000) {
            const hundreds = ["", "cien", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
            return hundreds[Math.floor(num / 100)] + (num % 100 !== 0 ? " " + numberToSpanishWords(num % 100) : "");
        } else {
            return num;
        }
    }

    function updateHiddenInput(hiddenInput, value) {
        hiddenInput.value = value;
        const event = new Event('input', { bubbles: true });
        hiddenInput.dispatchEvent(event);
    }

function formatTermDescription() {
    const units = unidadPlazo.value;
    const quantity = parseInt(cantidadUnidad.value, 10);

    if (units && !isNaN(quantity) && quantity > 0) {
        const quantityInWords = numberToSpanishWords(quantity, units);
        const unitForm = (quantity === 1) ? units.slice(0, -1) : units;
        const formattedTerm = `${quantityInWords} (${quantity}) ${unitForm}`;
        updateHiddenInput(hiddenInputPlazo, formattedTerm);
    } else {
        updateHiddenInput(hiddenInputPlazo, "");
    }
}

    function calculateTerminationDate(startDate) {
        const units = unidadPlazo.value;
        const quantity = parseInt(cantidadUnidad.value, 10);

        if (!units || isNaN(quantity) || quantity <= 0) {fechaTerminoDiv.textContent = "Por favor, ingrese todos los datos correctamente.";
            return;
        }

        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        const formattedStartDate = startDate.toLocaleDateString('es-ES', options);
        updateHiddenInput(hiddenInputFechaInicio, formattedStartDate);

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

        if (units !== "días") {
            endDate.setDate(endDate.getDate() - 1);
        }

        const formattedEndDate = endDate.toLocaleDateString('es-ES', options);
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

    comienzoSelector.addEventListener("change", function() {
        toggleStartDateInput();
        let startDate;
        if (comienzoSelector.value === "Fecha posterior" && customStartDate.value) {
            startDate = new Date(customStartDate.value);
            startDate.setDate(startDate.getDate() + 1);
        } else {
            startDate = new Date();
        }
        formatTermDescription();
        calculateTerminationDate(startDate);
    });

    [unidadPlazo, cantidadUnidad, customStartDate].forEach(input => {
        input.addEventListener("change", function() {
            let startDate;
            if (comienzoSelector.value === "Fecha posterior" && customStartDate.value) {
                startDate = new Date(customStartDate.value);
                startDate.setDate(startDate.getDate() + 1);
            } else {
                startDate = new Date();
            }
            formatTermDescription();
            calculateTerminationDate(startDate);
        });
    });
});
</script>

<script>
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('wf-form-1-00---Locacion-de-vivienda');
    
    if (form) {
      form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
        }
      });
    } else {
      console.error('Form not found!');
    }
  });
</script>

<script>
  document.addEventListener("DOMContentLoaded", function() {
    var selectElement = document.getElementById("PersonasLocador");

    function toggleDivs() {
      document.getElementById("Locadora-1-persona").style.display = "none";
      document.getElementById("Locadora-2-persona").style.display = "none";
      document.getElementById("Locadora-3-persona").style.display = "none";

      var selectedValue = selectElement.value;
      var numPeople = parseInt(selectedValue.charAt(0));

      for (var i = 1; i <= numPeople; i++) {
        document.getElementById("Locadora-" + i + "-persona").style.display = "block";
      }
    }

    selectElement.addEventListener("change", toggleDivs);

    if (selectElement.value === "1 persona") {
      document.getElementById("Locadora-1-persona").style.display = "block";
    } else {
        toggleDivs();
    }
  });
</script>

<script>
  document.addEventListener("DOMContentLoaded", function() {
    var selectElement = document.getElementById("PersonasLocatario");

    function toggleDivs() {
      document.getElementById("Locataria-1-persona").style.display = "none";
      document.getElementById("Locataria-2-persona").style.display = "none";
      document.getElementById("Locataria-3-persona").style.display = "none";

      var selectedValue = selectElement.value;
      var numPeople = parseInt(selectedValue.charAt(0));

      for (var i = 1; i <= numPeople; i++) {
        document.getElementById("Locataria-" + i + "-persona").style.display = "block";
      }
    }

    selectElement.addEventListener("change", toggleDivs);

    toggleDivs();
  });
</script>

<script>
  document.addEventListener("DOMContentLoaded", function() {
    
    function toggleNupciasDiv(estadoCivilId, nupciasId) {
      var estadoCivilElement = document.getElementById(estadoCivilId);
      var nupciasDiv = document.getElementById(nupciasId);

      function updateNupciasVisibility() {
        var selectedEstadoCivil = estadoCivilElement.value;
        
        const partyType = nupciasId.replace('nupcias', '').replace(/\d+$/, '');
        const number = nupciasId.match(/\d+$/)[0];
        
        const nupciasPlaceholderName = `nupcias${partyType}PF${number}`;
        const conyugePlaceholderName = `conyuge${partyType}PF${number}`;
        
        if (selectedEstadoCivil === 'casado/a') {
          nupciasDiv.style.display = "block";
          const nupciasPlaceholder = document.querySelector(`.preview-placeholder[data-placeholder="${nupciasPlaceholderName}"]`);
          const conyugePlaceholder = document.querySelector(`.preview-placeholder[data-placeholder="${conyugePlaceholderName}"]`);
          
          if (nupciasPlaceholder) nupciasPlaceholder.style.display = 'inline';
          if (conyugePlaceholder) conyugePlaceholder.style.display = 'inline';
        } else {
          nupciasDiv.style.display = "none";
          const nupciasPlaceholder = document.querySelector(`.preview-placeholder[data-placeholder="${nupciasPlaceholderName}"]`);
          const conyugePlaceholder = document.querySelector(`.preview-placeholder[data-placeholder="${conyugePlaceholderName}"]`);
          
          if (nupciasPlaceholder) nupciasPlaceholder.style.display = 'none';
          if (conyugePlaceholder) conyugePlaceholder.style.display = 'none';
        }
      }

      estadoCivilElement.addEventListener("change", updateNupciasVisibility);

      updateNupciasVisibility();
    }

    toggleNupciasDiv("estadocivilLocadorPF1", "nupciasLocador1");
    toggleNupciasDiv("estadocivilLocadorPF2", "nupciasLocador2");
    toggleNupciasDiv("estadocivilLocadorPF3", "nupciasLocador3");

    toggleNupciasDiv("estadocivilLocatarioPF1", "nupciasLocatario1");
    toggleNupciasDiv("estadocivilLocatarioPF2", "nupciasLocatario2");
    toggleNupciasDiv("estadocivilLocatarioPF3", "nupciasLocatario3");

    toggleNupciasDiv("estadocivilGarantePF1", "nupciasGarante1");
    toggleNupciasDiv("estadocivilGarantePF2", "nupciasGarante2");

  });
</script>








<script>
  window.onload = function() {
    const numberWords = {
      0: 'Cero', 1: 'Uno', 2: 'Dos', 3: 'Tres', 4: 'Cuatro', 5: 'Cinco', 6: 'Seis', 
      7: 'Siete', 8: 'Ocho', 9: 'Nueve', 10: 'Diez', 11: 'Once', 12: 'Doce', 
      13: 'Trece', 14: 'Catorce', 15: 'Quince', 16: 'Dieciséis', 17: 'Diecisiete', 
      18: 'Dieciocho', 19: 'Diecinueve', 20: 'Veinte', 30: 'Treinta', 40: 'Cuarenta', 
      50: 'Cincuenta', 60: 'Sesenta', 70: 'Setenta', 80: 'Ochenta', 90: 'Noventa', 
      100: 'Cien', 200: 'Doscientos', 300: 'Trescientos', 400: 'Cuatrocientos', 
      500: 'Quinientos', 600: 'Seiscientos', 700: 'Setecientos', 800: 'Ochocientos', 
      900: 'Novecientos', 1000: 'Mil'
    };

    function numberToWords(num) {
      if (num < 100) {
        return numberWords[num] || '';
      }
      if (num < 200) {
        let remainder = num % 100;
        return remainder === 0 ? 'Ciento' : `Ciento ${numberToWords(remainder)}`;
      }
      if (num < 1000) { //
        let hundreds = Math.floor(num / 100) * 100;
        let remainder = num % 100;
        return remainder === 0 ? numberWords[hundreds] : `${numberWords[hundreds]} ${numberToWords(remainder)}`;
      }
      if (num < 1000000) {
        let thousands = Math.floor(num / 1000);
        let remainder = num % 1000;
        let thousandsWord = thousands === 1 ? 'Mil' : `${numberToWords(thousands)} mil`;
        return remainder === 0 ? thousandsWord : `${thousandsWord} ${numberToWords(remainder)}`;
      }
      if (num >= 1000000) {
        let millions = Math.floor(num / 1000000);
        let remainder = num % 1000000;
        let millionsWord = millions === 1 ? 'Un millón' : `${numberToWords(millions)} millones`;
        return remainder === 0 ? millionsWord : `${millionsWord} ${numberToWords(remainder)}`;
      }
      return '';
    }

    function formatCanonDePagoLocacion() {
      const inputField = document.getElementById('canonDePagoLocacion');
      const hiddenField = document.getElementById('formatted-canon-hidden');

      const number = parseInt(inputField.value, 10);

      if (!isNaN(number)) {
        const numberInWords = numberToWords(number);

        hiddenField.value = numberInWords;

        const event = new Event('input', { bubbles: true });
        hiddenField.dispatchEvent(event);
      } else {
        hiddenField.value = '';
      }
    }
    function formatSumaDepositoGarantiaLocacion() {
      const inputField = document.getElementById('sumaDepositoGarantiaLocacion');
      const hiddenField = document.getElementById('hiddensumaDepositoGarantiaLocacion');

      const number = parseInt(inputField.value, 10);

      if (!isNaN(number)) {
        const numberInWords = numberToWords(number);

        hiddenField.value = numberInWords;

        const event = new Event('input', { bubbles: true });
        hiddenField.dispatchEvent(event);
      } else {
        hiddenField.value = '';
      }
    }

    const canonInput = document.getElementById('canonDePagoLocacion');
    const sumaDepositoInput = document.getElementById('sumaDepositoGarantiaLocacion');
    const canonForm = document.getElementById('canon-form');

    if (canonInput) {
      canonInput.addEventListener('input', formatCanonDePagoLocacion);
    }
    if (sumaDepositoInput) {
      sumaDepositoInput.addEventListener('input', formatSumaDepositoGarantiaLocacion);
    }
    if (canonForm) {
      canonForm.addEventListener('submit', function(event) {
        formatCanonDePagoLocacion();
        formatSumaDepositoGarantiaLocacion();
      });
    }
  };
</script>



<script>

function formatSignatureDate(date) {

const months = [

"enero", "febrero", "marzo", "abril", "mayo", "junio",

"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"

];

const day = date.getDate();

const month = months[date.getMonth()];

const year = date.getFullYear();

return `${day} de ${month} de ${year}`;

}




function setTodaySignatureDate() {

const today = new Date();

const formattedDate = formatSignatureDate(today);

document.getElementById('signature-date').textContent = formattedDate;

updateSignatureHiddenInput('formatted-signature-forward-date', formattedDate);

}




function updateSignatureHiddenInput(inputId, value) {

const hiddenInput = document.getElementById(inputId);

hiddenInput.value = value;

const event = new Event('input', { bubbles: true });

hiddenInput.dispatchEvent(event); 

}




document.getElementById('signature-date-selector').addEventListener('change', function(event) {

const selectedOption = event.target.value;


if (selectedOption === 'today') {


document.getElementById('Fecha-firma-locacion-vivienda').style.display = 'none';

setTodaySignatureDate();

} else if (selectedOption === 'next') {


document.getElementById('Fecha-firma-locacion-vivienda').style.display = 'block';

}

});




document.getElementById('custom-signature-date').addEventListener('change', function(event) {

const selectedDate = new Date(event.target.value);

selectedDate.setDate(selectedDate.getDate() + 1); // Add one day to the selected date

const formattedDate = formatSignatureDate(selectedDate);



document.getElementById('signature-date').textContent = formattedDate;

updateSignatureHiddenInput('formatted-signature-forward-date', formattedDate);

});




if (document.getElementById('signature-date-selector').value === 'today') {

setTodaySignatureDate();

}
</script>
