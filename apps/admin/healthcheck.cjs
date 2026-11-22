fetch("http://127.0.0.1:3000/sign-in")
  .then((response) => process.exit(response.ok ? 0 : 1))
  .catch(() => process.exit(1))
