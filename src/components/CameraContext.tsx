import { CameraView } from "expo-camera";
import { createContext, ReactNode, useContext, useRef } from "react";

const CameraRefContext = createContext<any>(null);
export function CameraProvider({ children }: { children: ReactNode }) {
  const cameraRef = useRef<CameraView>(null);
  return (
    <CameraRefContext.Provider value={cameraRef}>
      {children}
    </CameraRefContext.Provider>
  );
}

export function useSharedCameraRef() {
  const ref = useContext(CameraRefContext);
  if (!ref)
    throw new Error("useSharedCameraRef must be used inside CameraProvider");
  return ref;
}