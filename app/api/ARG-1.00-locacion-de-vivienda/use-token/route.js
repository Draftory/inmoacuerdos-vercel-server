document.addEventListener("DOMContentLoaded", function () {
  const botonToken = document.querySelector("#boton-token");

  if (botonToken) {
    botonToken.addEventListener("click", function () {
      // Get the URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const contractID = urlParams.get("contractID");
      const memberstackID = urlParams.get("MemberstackID");

      if (contractID && memberstackID) {
        // Construct the data to send to the API
        const data = {
          contractID: contractID,
          memberstackID: memberstackID,
        };

        // Call the API endpoint
        fetch("/api/update-token-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        })
          .then((response) => {
            if (!response.ok) {
              return response.json().then((errData) => {
                throw new Error(
                  errData.error || "Failed to update payment status."
                );
              });
            }
            return response.json();
          })
          .then((responseData) => {
            console.log("Payment status updated:", responseData);
            // Redirect to the success page
            window.location.href = "https://www.inmoacuerdos.com/success";
          })
          .catch((error) => {
            console.error("Error updating payment status:", error);
            // Optionally, display an error message to the user
            alert(`Error processing payment: ${error.message}`);
          });
      } else {
        console.error("contractID or MemberstackID not found in the URL.");
        alert("Error: Missing contractID or MemberstackID in the URL.");
      }
    });
  } else {
    console.warn("Button with ID #boton-token not found on the page.");
  }
});
