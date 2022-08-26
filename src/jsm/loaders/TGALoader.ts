import {
  DataTextureLoader,
  LinearMipmapLinearFilter,
  LoadingManager,
} from 'three';

type TGAHeader = {
  image_type: number;
  pixel_size: number;
  width: number;
  height: number;
  colormap_length: number;
  colormap_size: number;
  colormap_type: number;
};

class TGALoader extends DataTextureLoader {
  constructor(manager: LoadingManager) {
    super(manager);
  }

  parse(buffer: Buffer) {
    // reference from vthibault, https://github.com/vthibault/roBrowser/blob/master/src/Loaders/Targa.js

    function tgaCheckHeader(header: TGAHeader) {
      switch (header.image_type) {
        // check indexed type

        case TGA_TYPE_INDEXED:
        case TGA_TYPE_RLE_INDEXED:
          if (
            header.colormap_length > 256 ||
            header.colormap_size !== 24 ||
            header.colormap_type !== 1
          ) {
            console.error(
              'THREE.TGALoader: Invalid type colormap data for indexed type.'
            );
          }

          break;

        // check colormap type

        case TGA_TYPE_RGB:
        case TGA_TYPE_GREY:
        case TGA_TYPE_RLE_RGB:
        case TGA_TYPE_RLE_GREY:
          if (header.colormap_type) {
            console.error(
              'THREE.TGALoader: Invalid type colormap data for colormap type.'
            );
          }

          break;

        // What the need of a file without data ?

        case TGA_TYPE_NO_DATA:
          console.error('THREE.TGALoader: No data.');

          break;

        // Invalid type ?

        default:
          console.error(
            'THREE.TGALoader: Invalid type "%s".',
            header.image_type
          );
      }

      // check image width and height

      if (header.width <= 0 || header.height <= 0) {
        console.error('THREE.TGALoader: Invalid image size.');
      }

      // check image pixel size

      if (
        header.pixel_size !== 8 &&
        header.pixel_size !== 16 &&
        header.pixel_size !== 24 &&
        header.pixel_size !== 32
      ) {
        console.error(
          'THREE.TGALoader: Invalid pixel size "%s".',
          header.pixel_size
        );
      }
    }

    // parse tga image buffer

    function tgaParse(
      use_rle: boolean,
      use_pal: boolean,
      header: TGAHeader,
      offset: number,
      data: Uint8Array
    ) {
      let pixel_data;
      let palettes = new Uint8Array();

      const pixel_size = header.pixel_size >> 3;
      const pixel_total = header.width * header.height * pixel_size;

      // read palettes

      if (use_pal) {
        palettes = data.subarray(
          offset,
          (offset += header.colormap_length * (header.colormap_size >> 3))
        );
      }

      // read RLE

      if (use_rle) {
        pixel_data = new Uint8Array(pixel_total);

        let c, count, i;
        let shift = 0;
        const pixels = new Uint8Array(pixel_size);

        while (shift < pixel_total) {
          c = data[offset++];
          count = (c & 0x7f) + 1;

          // RLE pixels

          if (c & 0x80) {
            // bind pixel tmp array

            for (i = 0; i < pixel_size; ++i) {
              pixels[i] = data[offset++];
            }

            // copy pixel array

            for (i = 0; i < count; ++i) {
              pixel_data.set(pixels, shift + i * pixel_size);
            }

            shift += pixel_size * count;
          } else {
            // raw pixels

            count *= pixel_size;

            for (i = 0; i < count; ++i) {
              pixel_data[shift + i] = data[offset++];
            }

            shift += count;
          }
        }
      } else {
        // raw pixels

        pixel_data = data.subarray(
          offset,
          (offset += use_pal ? header.width * header.height : pixel_total)
        );
      }

      return {
        pixel_data: pixel_data,
        palettes: palettes,
      };
    }

    function tgaGetImageData8bits(
      imageData: Uint8Array,
      y_start: number,
      y_step: number,
      y_end: number,
      x_start: number,
      x_step: number,
      x_end: number,
      image: Uint8Array,
      palettes: Uint8Array
    ) {
      const colormap = palettes;
      let color,
        i = 0,
        x,
        y;
      const width = header.width;

      for (y = y_start; y !== y_end; y += y_step) {
        for (x = x_start; x !== x_end; x += x_step, i++) {
          color = image[i];
          imageData[(x + width * y) * 4 + 3] = 255;
          imageData[(x + width * y) * 4 + 2] = colormap[color * 3 + 0];
          imageData[(x + width * y) * 4 + 1] = colormap[color * 3 + 1];
          imageData[(x + width * y) * 4 + 0] = colormap[color * 3 + 2];
        }
      }

      return imageData;
    }

    function tgaGetImageData16bits(
      imageData: Uint8Array,
      y_start: number,
      y_step: number,
      y_end: number,
      x_start: number,
      x_step: number,
      x_end: number,
      image: Uint8Array
    ) {
      let color,
        i = 0,
        x,
        y;
      const width = header.width;

      for (y = y_start; y !== y_end; y += y_step) {
        for (x = x_start; x !== x_end; x += x_step, i += 2) {
          color = image[i + 0] + (image[i + 1] << 8);
          imageData[(x + width * y) * 4 + 0] = (color & 0x7c00) >> 7;
          imageData[(x + width * y) * 4 + 1] = (color & 0x03e0) >> 2;
          imageData[(x + width * y) * 4 + 2] = (color & 0x001f) << 3;
          imageData[(x + width * y) * 4 + 3] = color & 0x8000 ? 0 : 255;
        }
      }

      return imageData;
    }

    function tgaGetImageData24bits(
      imageData: Uint8Array,
      y_start: number,
      y_step: number,
      y_end: number,
      x_start: number,
      x_step: number,
      x_end: number,
      image: Uint8Array
    ) {
      let i = 0,
        x,
        y;
      const width = header.width;

      for (y = y_start; y !== y_end; y += y_step) {
        for (x = x_start; x !== x_end; x += x_step, i += 3) {
          imageData[(x + width * y) * 4 + 3] = 255;
          imageData[(x + width * y) * 4 + 2] = image[i + 0];
          imageData[(x + width * y) * 4 + 1] = image[i + 1];
          imageData[(x + width * y) * 4 + 0] = image[i + 2];
        }
      }

      return imageData;
    }

    function tgaGetImageData32bits(
      imageData: Uint8Array,
      y_start: number,
      y_step: number,
      y_end: number,
      x_start: number,
      x_step: number,
      x_end: number,
      image: Uint8Array
    ) {
      let i = 0,
        x,
        y;
      const width = header.width;

      for (y = y_start; y !== y_end; y += y_step) {
        for (x = x_start; x !== x_end; x += x_step, i += 4) {
          imageData[(x + width * y) * 4 + 2] = image[i + 0];
          imageData[(x + width * y) * 4 + 1] = image[i + 1];
          imageData[(x + width * y) * 4 + 0] = image[i + 2];
          imageData[(x + width * y) * 4 + 3] = image[i + 3];
        }
      }

      return imageData;
    }

    function tgaGetImageDataGrey8bits(
      imageData: Uint8Array,
      y_start: number,
      y_step: number,
      y_end: number,
      x_start: number,
      x_step: number,
      x_end: number,
      image: Uint8Array
    ) {
      let color,
        i = 0,
        x,
        y;
      const width = header.width;

      for (y = y_start; y !== y_end; y += y_step) {
        for (x = x_start; x !== x_end; x += x_step, i++) {
          color = image[i];
          imageData[(x + width * y) * 4 + 0] = color;
          imageData[(x + width * y) * 4 + 1] = color;
          imageData[(x + width * y) * 4 + 2] = color;
          imageData[(x + width * y) * 4 + 3] = 255;
        }
      }

      return imageData;
    }

    function tgaGetImageDataGrey16bits(
      imageData: Uint8Array,
      y_start: number,
      y_step: number,
      y_end: number,
      x_start: number,
      x_step: number,
      x_end: number,
      image: Uint8Array
    ) {
      let i = 0,
        x,
        y;
      const width = header.width;

      for (y = y_start; y !== y_end; y += y_step) {
        for (x = x_start; x !== x_end; x += x_step, i += 2) {
          imageData[(x + width * y) * 4 + 0] = image[i + 0];
          imageData[(x + width * y) * 4 + 1] = image[i + 0];
          imageData[(x + width * y) * 4 + 2] = image[i + 0];
          imageData[(x + width * y) * 4 + 3] = image[i + 1];
        }
      }

      return imageData;
    }

    function getTgaRGBA(
      data: Uint8Array,
      width: number,
      height: number,
      image: Uint8Array,
      palette: Uint8Array
    ) {
      let x_start, y_start, x_step, y_step, x_end, y_end;

      switch ((header.flags & TGA_ORIGIN_MASK) >> TGA_ORIGIN_SHIFT) {
        default:
        case TGA_ORIGIN_UL:
          x_start = 0;
          x_step = 1;
          x_end = width;
          y_start = 0;
          y_step = 1;
          y_end = height;
          break;

        case TGA_ORIGIN_BL:
          x_start = 0;
          x_step = 1;
          x_end = width;
          y_start = height - 1;
          y_step = -1;
          y_end = -1;
          break;

        case TGA_ORIGIN_UR:
          x_start = width - 1;
          x_step = -1;
          x_end = -1;
          y_start = 0;
          y_step = 1;
          y_end = height;
          break;

        case TGA_ORIGIN_BR:
          x_start = width - 1;
          x_step = -1;
          x_end = -1;
          y_start = height - 1;
          y_step = -1;
          y_end = -1;
          break;
      }

      if (use_grey) {
        switch (header.pixel_size) {
          case 8:
            tgaGetImageDataGrey8bits(
              data,
              y_start,
              y_step,
              y_end,
              x_start,
              x_step,
              x_end,
              image
            );
            break;

          case 16:
            tgaGetImageDataGrey16bits(
              data,
              y_start,
              y_step,
              y_end,
              x_start,
              x_step,
              x_end,
              image
            );
            break;

          default:
            console.error('THREE.TGALoader: Format not supported.');
            break;
        }
      } else {
        switch (header.pixel_size) {
          case 8:
            tgaGetImageData8bits(
              data,
              y_start,
              y_step,
              y_end,
              x_start,
              x_step,
              x_end,
              image,
              palette
            );
            break;

          case 16:
            tgaGetImageData16bits(
              data,
              y_start,
              y_step,
              y_end,
              x_start,
              x_step,
              x_end,
              image
            );
            break;

          case 24:
            tgaGetImageData24bits(
              data,
              y_start,
              y_step,
              y_end,
              x_start,
              x_step,
              x_end,
              image
            );
            break;

          case 32:
            tgaGetImageData32bits(
              data,
              y_start,
              y_step,
              y_end,
              x_start,
              x_step,
              x_end,
              image
            );
            break;

          default:
            console.error('THREE.TGALoader: Format not supported.');
            break;
        }
      }

      // Load image data according to specific method
      // let func = 'tgaGetImageData' + (use_grey ? 'Grey' : '') + (header.pixel_size) + 'bits';
      // func(data, y_start, y_step, y_end, x_start, x_step, x_end, width, image, palette );
      return data;
    }

    // TGA constants

    const TGA_TYPE_NO_DATA = 0,
      TGA_TYPE_INDEXED = 1,
      TGA_TYPE_RGB = 2,
      TGA_TYPE_GREY = 3,
      TGA_TYPE_RLE_INDEXED = 9,
      TGA_TYPE_RLE_RGB = 10,
      TGA_TYPE_RLE_GREY = 11,
      TGA_ORIGIN_MASK = 0x30,
      TGA_ORIGIN_SHIFT = 0x04,
      TGA_ORIGIN_BL = 0x00,
      TGA_ORIGIN_BR = 0x01,
      TGA_ORIGIN_UL = 0x02,
      TGA_ORIGIN_UR = 0x03;

    if (buffer.length < 19)
      console.error('THREE.TGALoader: Not enough data to contain header.');

    let offset = 0;

    const content = new Uint8Array(buffer),
      header = {
        id_length: content[offset++],
        colormap_type: content[offset++],
        image_type: content[offset++],
        colormap_index: content[offset++] | (content[offset++] << 8),
        colormap_length: content[offset++] | (content[offset++] << 8),
        colormap_size: content[offset++],
        origin: [
          content[offset++] | (content[offset++] << 8),
          content[offset++] | (content[offset++] << 8),
        ],
        width: content[offset++] | (content[offset++] << 8),
        height: content[offset++] | (content[offset++] << 8),
        pixel_size: content[offset++],
        flags: content[offset++],
      };

    // check tga if it is valid format

    tgaCheckHeader(header);

    if (header.id_length + offset > buffer.length) {
      console.error('THREE.TGALoader: No data.');
    }

    // skip the needn't data

    offset += header.id_length;

    // get targa information about RLE compression and palette

    let use_rle = false,
      use_pal = false,
      use_grey = false;

    switch (header.image_type) {
      case TGA_TYPE_RLE_INDEXED:
        use_rle = true;
        use_pal = true;
        break;

      case TGA_TYPE_INDEXED:
        use_pal = true;
        break;

      case TGA_TYPE_RLE_RGB:
        use_rle = true;
        break;

      case TGA_TYPE_RGB:
        break;

      case TGA_TYPE_RLE_GREY:
        use_rle = true;
        use_grey = true;
        break;

      case TGA_TYPE_GREY:
        use_grey = true;
        break;
    }

    //

    const imageData = new Uint8Array(header.width * header.height * 4);
    const result = tgaParse(use_rle, use_pal, header, offset, content);
    getTgaRGBA(
      imageData,
      header.width,
      header.height,
      result.pixel_data,
      result.palettes
    );

    return {
      data: imageData,
      width: header.width,
      height: header.height,
      flipY: true,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
    };
  }
}

export { TGALoader };