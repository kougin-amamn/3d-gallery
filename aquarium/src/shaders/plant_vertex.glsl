// 葉の形: 根元からの反りとねじれ
vec3 transformed = vec3(position);
float h = position.y;
vPlantH = h;
transformed.z += aPlant.z * h * h;
float tw = aPlant.w * h;
float ct = cos(tw), st = sin(tw);
transformed.xz = vec2(ct * transformed.x - st * transformed.z, st * transformed.x + ct * transformed.z);
