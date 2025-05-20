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

// Function to handle saving as draft/final (INTEGRATED WITH VALIDATION)
async function saveContractVersion(event, status, redirectUrl = "/success") {
    if (event) event.preventDefault();

    const formElement = document.querySelector("#wf-form-1-00---Locacion-de-vivienda");
    const formData = new FormData(formElement);
    const formObject = Object.fromEntries(formData);

    // **Lógica de validación de campos obligatorios**
    const camposRequeridos = formElement.querySelectorAll('input[required], select[required], textarea[required]'); // Todos los tipos

    let todosCompletos = true;

    camposRequeridos.forEach(campo => {
        if (campo.type === 'radio') {
            // Validación de radio buttons: verifica que al menos uno esté seleccionado en el grupo
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
                 // Agrega la clase de error al primer radio del grupo para marcar el grupo como erroneo
                if(radioGroup.length > 0){
                    radioGroup[0].classList.add('error-requerido');
                }
            }else{
                radioGroup.forEach(radio =>  radio.classList.remove('error-requerido'));
            }
        } else if (campo.type === 'checkbox') {
             if (!campo.checked) {
                todosCompletos = false;
                console.error(`El campo "${campo.name}" es obligatorio.`);
                campo.classList.add('error-requerido');
            } else {
                campo.classList.remove('error-requerido');
            }
        }
        else if (!campo.value.trim()) {
            todosCompletos = false;
            console.error(`El campo "${campo.name}" es obligatorio.`);
            campo.classList.add('error-requerido');
        } else {
            campo.classList.remove('error-requerido');
        }
    });

    // Si no todos los campos obligatorios están completos, muestra la alerta y detiene la función
    if (!todosCompletos) {
        alert('Por favor, completa todos los campos obligatorios.');
        return; // Detiene la ejecución de la función aquí
    }

    // **Continuación de la función si la validación es exitosa**

    // Asegúrate de que contractID exista
    if (!formObject.contractID) {
        alert("No contract ID found. Por favor, interactúa con el formulario para generar un ID.");
        return;
    }

    formObject.draftVersion = parseInt(formObject.draftVersion) || 1;
    formObject.status = status;
    formElement.querySelector("input[name='status']").value = status;
    formObject.timestamp = getBuenosAiresTimestamp(); // Usa la función corregida

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
            const result = await response.json();

            // Selecciona el botón específico por su ID y atributo
            const loginRedirectButton = document.querySelector('#mis-contratos[data-ms-action="login-redirect"]');

            if (loginRedirectButton) {
                alert("Guardado exitosamente. Redirigiendo a Mis Contratos...");
                loginRedirectButton.click(); // Simula el clic en el botón de Memberstack
            } else {
                console.warn('No se encontró el botón con id="#mis-contratos" y data-ms-action="login-redirect". Redirigiendo a /success por defecto.');
                window.location.href = "/success"; // Fallback si el botón no existe
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

// Event listener for the "Finalizar" button (which is also .save-as-final-btn)
document.addEventListener('DOMContentLoaded', function() {
    const finalizarBtn = document.querySelector('#boton-finalizar.save-as-final-btn'); // Combined selector

    if (finalizarBtn) {
        finalizarBtn.addEventListener('click', function(event) {
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
document.addEventListener('DOMContentLoaded', function() {
    const guardarBorradorBtn = document.querySelector('.save-as-draft-btn');

    if (guardarBorradorBtn) {
        guardarBorradorBtn.addEventListener('click', function(event) {
            saveContractVersion(event, "Borrador"); // Llama a la función con status "Borrador"
        });
     } else {
        console.error('No se encontró el botón .save-as-draft-btn');
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const tipoGarantiaSelect = document.getElementById('tipo_garantia');
    const otroGarantiaInput = document.getElementById('otro_garantia_input');

    tipoGarantiaSelect.addEventListener('change', function() {
        if (this.value === 'otro') {
            otroGarantiaInput.style.display = 'block';
        } else {
            otroGarantiaInput.style.display = 'none';
        }
    });
});
</script>
