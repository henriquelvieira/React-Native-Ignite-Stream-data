import { makeRedirectUri, revokeAsync, startAsync } from 'expo-auth-session';
import React, { useEffect, createContext, useContext, useState, ReactNode } from 'react';
import { generateRandom } from 'expo-auth-session/build/PKCE';
import AsyncStorage from '@react-native-async-storage/async-storage';


import { api } from '../services/api';

interface User {
  id: number;
  display_name: string;
  email: string;
  profile_image_url: string;
};

interface UserWithToken extends User {
  access_token: string;
};

interface AuthContextData {
  user: User;
  isLoggingOut: boolean;
  isLoggingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

interface AuthProviderData {
  children: ReactNode;
};

interface AuthorizationResponse {
  params: {
    error: string;
    state: string;
  },
  type: string;
}; 

const { CLIENT_ID } = process.env; 

const AuthContext = createContext({} as AuthContextData);

const twitchEndpoints = {
  authorization: 'https://id.twitch.tv/oauth2/authorize',
  revocation: 'https://id.twitch.tv/oauth2/revoke'
};

function AuthProvider({ children }: AuthProviderData) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [user, setUser] = useState({} as User);
  const [userToken, setUserToken] = useState('');


  async function loadUserFromLocalStorage(){
    const dataKey = '@stream.data:user';
    const userLocalStorage = await AsyncStorage.getItem(dataKey);
    
    if (userLocalStorage) {
      
      const { 
        id, 
        display_name, 
        email, 
        profile_image_url,
        access_token
      } = JSON.parse(userLocalStorage) as UserWithToken; 
      
      setUser({
        id, 
        display_name, 
        email, 
        profile_image_url
      });  

      setUserToken(access_token);
      api.defaults.headers.authorization = `Bearer ${access_token}`;
    };

  }; 

  async function saveUserOnLocalStorage(user: UserWithToken){
    const dataKey = '@stream.data:user';
    await AsyncStorage.setItem(dataKey, JSON.stringify(user));
  };

  async function removeUserFromLocalStorage(){
    const dataKey = '@stream.data:user';
    await AsyncStorage.removeItem(dataKey);
  };

  async function signIn() {
    try {
      setIsLoggingIn(true);

      const REDIRECT_URI = makeRedirectUri({ useProxy: true }); //gerar url de redirect com base no usu??rio logado na CLI do Expo
      const RESPONSE_TYPE = 'token';
      const SCOPE = encodeURI('openid user:read:email user:read:follows');
      const FORCE_VERIFY = true;
      const STATE = generateRandom(30);

      const authUrl = twitchEndpoints.authorization + 
      `?client_id=${CLIENT_ID}` + 
      `&redirect_uri=${REDIRECT_URI}` + 
      `&response_type=${RESPONSE_TYPE}` + 
      `&scope=${SCOPE}` + 
      `&force_verify=${FORCE_VERIFY}` +
      `&state=${STATE}`;
   
      const authResponse = await startAsync({ authUrl });
      
      if (authResponse.type === 'success' && authResponse.params.error !== 'access_denied'){
        
        if (authResponse.params.state !== STATE) {
          throw new Error('Invalid state value')
        };

        const accessToken = authResponse.params.access_token;

        api.defaults.headers.authorization = `Bearer ${authResponse.params.access_token}`;

        const userResponse = await api.get('/users'); //get profile's info
        const userResponseData = userResponse.data.data[0] as User;

        const userResponseFormatted = {
          id: userResponseData.id,
          display_name: userResponseData.display_name,
          email: userResponseData.email,
          profile_image_url: userResponseData.profile_image_url            
        };

        setUserToken(accessToken);  
        setUser(userResponseFormatted);

        await saveUserOnLocalStorage({
          ...userResponseFormatted,
          access_token: accessToken
        });

      };

    } catch (error) {
      throw new Error();
    } finally {
      setIsLoggingIn(false);
    };

  };

  async function signOut() {
    try {
      setIsLoggingOut(true);

      const singOutConfig = {
        token: userToken,
        clientId: CLIENT_ID
      };

      const singOutDiscovery = {
        revocationEndpoint: twitchEndpoints.revocation
      };
       
      await revokeAsync(singOutConfig, singOutDiscovery);
    } catch (error) {
    } finally {
      setUser({} as User)
      setUserToken('');
      removeUserFromLocalStorage();      
      delete api.defaults.headers.authorization;
      setIsLoggingOut(false);
    }
  };

  useEffect(() => {
    api.defaults.headers['Client-Id'] = CLIENT_ID;
    loadUserFromLocalStorage();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoggingOut, isLoggingIn, signIn, signOut }}>
      { children }
    </AuthContext.Provider>
  )
};

function useAuth() {
  const context = useContext(AuthContext);
  return context;
};

export { AuthProvider, useAuth };
