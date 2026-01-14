/**
 * Type declarations for occt-import-js
 */

declare module 'occt-import-js' {
  interface OCCTMesh {
    name: string;
    attributes: {
      position: {
        array: number[][]; // Array of [x, y, z] triplets
      };
      normal?: {
        array: number[][]; // Array of [x, y, z] triplets
      };
    };
    index: {
      array: number[][]; // Array of [i1, i2, i3] triplets
    };
    color?: [number, number, number];
    brep_faces?: Array<{
      first: number;
      last: number;
      color?: [number, number, number] | null;
    }>;
  }

  interface OCCTResult {
    success: boolean;
    root?: {
      name: string;
      meshes: number[];
      children: any[];
    };
    meshes: OCCTMesh[];
  }

  interface OCCTModule {
    ReadStepFile(buffer: Uint8Array, options: any): OCCTResult;
  }

  interface OCCTOptions {
    locateFile?: (filename: string) => string;
  }

  function occtimportjs(options?: OCCTOptions): Promise<OCCTModule>;

  export default occtimportjs;
}
