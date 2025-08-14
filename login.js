const auth = firebase.auth();
const db = firebase.firestore();
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const slider = document.querySelector('.form-slider');

loginBtn.addEventListener('click', () => {
  loginBtn.classList.add('active');
  signupBtn.classList.remove('active');
  slider.style.transform = 'translateX(0)';
});

signupBtn.addEventListener('click', () => {
  signupBtn.classList.add('active');
  loginBtn.classList.remove('active');
  slider.style.transform = 'translateX(-50%)';
});


// Login
document.getElementById("loginForm").addEventListener("submit", e => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      window.location.href = "index.html";
    })
    .catch(err => {
      document.getElementById("loginError").textContent = err.message;
    });
});

// Cadastro
document.getElementById("signupForm").addEventListener("submit", e => {
  e.preventDefault();
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;

  auth.createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      // Cria documento do usuário
      db.collection("usuarios").doc(userCredential.user.uid).set({
        email: email,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
      alert("Usuário cadastrado com sucesso! Faça login.");
    })
    .catch(err => {
      document.getElementById("signupError").textContent = err.message;
    });
});

// Redireciona se já estiver logado
auth.onAuthStateChanged(user => {
  if(user){
    window.location.href = "index.html";
  }
});
