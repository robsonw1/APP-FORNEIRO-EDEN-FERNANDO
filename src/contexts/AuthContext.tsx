import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  user: { username: string } | null;
  login: (username: string, password: string) => boolean;
  logout: (redirect?: () => void) => void;
  changePassword: (currentPassword: string, newPassword: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';
const STORAGE_KEY = 'auth_credentials';

// Evento customizado para sincronizar mudanças
const authChangeEvent = new EventTarget();

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ username: string } | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    const storedUsername = sessionStorage.getItem('auth_username');
    if (token && storedUsername) {
      setIsAuthenticated(true);
      setUser({ username: storedUsername });
    }

    // Listener para mudanças de senha em tempo real
    const handleAuthChange = () => {
      const currentToken = sessionStorage.getItem('auth_token');
      const currentUsername = sessionStorage.getItem('auth_username');
      if (currentToken && currentUsername) {
        setIsAuthenticated(true);
        setUser({ username: currentUsername });
      }
    };

    authChangeEvent.addEventListener('authchange', handleAuthChange);

    return () => {
      authChangeEvent.removeEventListener('authchange', handleAuthChange);
    };
  }, []);

  const login = (username: string, password: string): boolean => {
    const stored = localStorage.getItem(STORAGE_KEY);
    let credentials = stored ? JSON.parse(stored) : { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD };

    if (credentials.username === username && credentials.password === password) {
      sessionStorage.setItem('auth_token', 'valid');
      sessionStorage.setItem('auth_username', username);
      setIsAuthenticated(true);
      setUser({ username });
      
      // Dispara evento de mudança
      authChangeEvent.dispatchEvent(new CustomEvent('authchange'));
      return true;
    }
    return false;
  };

  const logout = (redirect?: () => void) => {
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_username');
    setIsAuthenticated(false);
    setUser(null);
    
    // Dispara evento de mudança
    authChangeEvent.dispatchEvent(new CustomEvent('authchange'));
    
    // Executa o redirecionamento se fornecido
    if (redirect) {
      redirect();
    }
  };

  const changePassword = (currentPassword: string, newPassword: string): boolean => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const credentials = stored ? JSON.parse(stored) : { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD };

    if (credentials.password === currentPassword) {
      credentials.password = newPassword;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
      
      // Dispara evento de mudança
      authChangeEvent.dispatchEvent(new CustomEvent('authchange'));
      return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};
