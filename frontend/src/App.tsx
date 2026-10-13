import { useEffect, useState } from "react";
import { api } from "./api";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";

export function App() {
  const [authed, setAuthed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setAuthed(api.hasToken());
    setLoaded(true);
  }, []);

  if (authed) {
    return (
      <Dashboard
        onLogout={() => {
          api.logout();
          setAuthed(false);
        }}
      />
    );
  }
  return <Login onLogin={() => setAuthed(true)} key={loaded ? "app" : "boot"} />;
}

export default App;
