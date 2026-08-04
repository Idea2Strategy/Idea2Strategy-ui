import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { defaultCompetitionRoomsClient } from './api/competitionRooms';

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');
createRoot(root).render(<StrictMode><App competitionRoomsClient={defaultCompetitionRoomsClient} /></StrictMode>);
