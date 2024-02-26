import mapboxgl, {
  CustomLayerInterface,
} from "mapbox-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";

interface Mtransform {
  translateX: number;
  translateY: number;
  translateZ: number | undefined;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  scale: number;
}

export class CustomIFCLayer
  implements CustomLayerInterface
{
  static gltfData:
    | ArrayBuffer
    | { [key: string]: any };
  id: string;
  type: "custom";
  renderingMode?: "2d" | "3d" | undefined;
  camera: THREE.Camera = new THREE.Camera();
  scene: THREE.Scene = new THREE.Scene();
  map: mapboxgl.Map | null = null;
  renderer: THREE.WebGLRenderer | null = null;

  modelTransform: Mtransform;
  modelAltitude = 0;
  modelRotate = [Math.PI / 2, 0, 0];
  constructor(coordinates: mapboxgl.LngLatLike) {
    this.id = "3d-ifc-model";
    this.type = "custom";
    this.renderingMode = "3d";
    const modelAsMercatorCoordinate =
      mapboxgl.MercatorCoordinate.fromLngLat(
        coordinates,
        this.modelAltitude
      );
    this.modelTransform = {
      translateX: modelAsMercatorCoordinate.x,
      translateY: modelAsMercatorCoordinate.y,
      translateZ: modelAsMercatorCoordinate.z,
      rotateX: this.modelRotate[0],
      rotateY: this.modelRotate[1],
      rotateZ: this.modelRotate[2],
      /* Since our 3D model is in real world meters, a scale transform needs to be
       * applied since the CustomLayerInterface expects units in MercatorCoordinates.
       */
      scale:
        modelAsMercatorCoordinate.meterInMercatorCoordinateUnits(),
    };
  }

  //once layer has been added to the Map
  async onAdd(
    map: mapboxgl.Map,
    gl: WebGL2RenderingContext
  ) {
    //ADD LIGHTS
    // const directionalLight =
    //   new THREE.DirectionalLight(0xffffff);
    // directionalLight.position
    //   .set(0, -70, 100)
    //   .normalize();
    // this.scene.add(directionalLight);
    // const directionalLight2 =
    //   new THREE.DirectionalLight(0xffffff);
    // directionalLight2.position
    //   .set(0, 70, 100)
    //   .normalize();
    // this.scene.add(directionalLight2);
    const ambientLight = new THREE.AmbientLight(
      0xffffff,
      1
    );
    this.scene.add(ambientLight);

    //add or fragments to the scene!
    //shouldn't we add the model to an existing map scene??
    //why it works creating a new webglrenderer that uses the mapbox canvas and webglcontext?
    //shouldn't they overlap each other with that approach??
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(
      "https://docs.mapbox.com/mapbox-gl-js/assets/34M_17/34M_17.gltf"
    );

    this.scene.add(gltf.scene);
    // const gltf = await loader.parseAsync(
    //   JSON.stringify(
    //     CustomIFCLayer.gltfData,
    //     null,
    //     2
    //   ),
    //   ""
    // );
    // const mesh = gltf.scene;
    // this.scene.add(mesh);
    // console.log("gltf loaded: ", mesh);
    //...

    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
  }
  render(
    gl: WebGL2RenderingContext,
    matrix: Array<number>
  ) {
    const rotationX =
      new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        this.modelTransform.rotateX
      );
    const rotationY =
      new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 1, 0),
        this.modelTransform.rotateY
      );
    const rotationZ =
      new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 0, 1),
        this.modelTransform.rotateZ
      );
    const m = new THREE.Matrix4().fromArray(
      matrix
    );
    const l = new THREE.Matrix4()
      .makeTranslation(
        this.modelTransform.translateY,
        this.modelTransform.translateX,
        this.modelTransform.translateZ ?? 0
      )
      .scale(
        new THREE.Vector3(
          this.modelTransform.scale,
          -this.modelTransform.scale,
          this.modelTransform.scale
        )
      )
      .multiply(rotationX)
      .multiply(rotationY)
      .multiply(rotationZ);

    this.camera.projectionMatrix = m.multiply(l);
    if (this.renderer !== null) {
      this.renderer.resetState();
      this.renderer.render(
        this.scene,
        this.camera
      );
    }
    if (this.map !== null) {
      this.map.triggerRepaint();
    }
  }
  //optional
  prerender() {}
  onRemove() {}
}
const lng = -77.029499;
const lat = -12.120621;
const coordinates = new mapboxgl.LngLat(lng, lat);
mapboxgl.accessToken = "youraccesstoken";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/light-v10", //"mapbox://styles/mapbox/streets-v9",
  projection: { name: "globe" }, // Display the map as a globe, since satellite-v9 defaults to Mercator
  zoom: 2,
  center: coordinates, //[lng,lat]
  antialias: true,
  pitch: 60,
});

const ifcLayer = new CustomIFCLayer(coordinates);
map.on("style.load", async () => {
  //i) add custom 3d model layer
  map.addLayer(ifcLayer, "waterway-label"); //"building"

  //ii) setup for planet UI
  map.setFog({
    color: "rgb(186, 210, 235)", // Lower atmosphere
    "high-color": "rgb(36, 92, 223)", // Upper atmosphere
    "horizon-blend": 0.02, // Atmosphere thickness (default 0.2 at low zooms)
    "space-color": "rgb(11, 11, 25)", // Background color
    "star-intensity": 0.6, // Background star brightness (default 0.35 at low zoooms )
  });
  //iii) add building extrusion layer
  const layers = map.getStyle().layers;
  const labelLayerId = layers.find(
    (layer) =>
      layer.type === "symbol" &&
      layer.layout !== undefined &&
      layer.layout["text-field"]
  )?.id;
  map.addLayer(
    {
      id: "add-3d-buildings",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 15,
      paint: {
        "fill-extrusion-color": "#aaa",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          15.05,
          ["get", "height"],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          15.05,
          ["get", "min_height"],
        ],
        "fill-extrusion-opacity": 0.6,
      },
    },
    labelLayerId
  );
});
map.on("load", () => {
  map.flyTo({
    center: coordinates,
    zoom: 20.5,
    pitch: 75,
    essential: true,
    duration: 12000,
  });

  setTimeout(() => {}, 1000);
});
