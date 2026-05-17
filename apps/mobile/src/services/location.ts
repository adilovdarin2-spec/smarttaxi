import * as Location from "expo-location";

export type Coordinates = {
  lat: number;
  lng: number;
};

export async function getCurrentCoordinates(): Promise<Coordinates> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Геолокация запрещена. Разрешите доступ или введите адрес вручную.");
  }

  const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    lat: Number(current.coords.latitude.toFixed(6)),
    lng: Number(current.coords.longitude.toFixed(6))
  };
}
