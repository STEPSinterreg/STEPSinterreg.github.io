
import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Dashboard from "../pages/Dashboard";
import HearingLoss from "../experiences/hearing-loss/HearingLoss";
import AudioLab from "../pages/AudioLab";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "experiences/hearing-loss", element: <HearingLoss /> },
        { path: "audio-lab", element: <AudioLab /> },
    ],
  },
], {
  basename: import.meta.env.BASE_URL,
});
