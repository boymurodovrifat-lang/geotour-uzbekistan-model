"""Reduce yearly TerraClimate subsets to 1991-2020 monthly normals.

Input: a bundle written by the download helper: uint32 (LE) header length, 4 pad bytes, a JSON list of
{name: "tc_<var>_<year>.nc", length}, then the netCDF-3 files back to back. Each file is an NCSS subset
(var, one year, 12 months) of the TerraClimate aggregated datasets, bbox N45.7 S37.1 W55.9 E73.3,
horizStride=3 (1/8 degree). Output: terraclimate_normals_1991_2020.npz with lat, lon and one
(12, nlat, nlon) float32 array per variable (NaN outside land).

Run: python analysis/climate/reduce_terraclimate.py BUNDLE OUT.npz
"""
import io, json, struct, sys
from collections import defaultdict
import numpy as np
from scipy.io import netcdf_file

VARS = ['tmax', 'tmin', 'ppt', 'srad', 'ws', 'vap']


def main(bundle, out):
    b = open(bundle, 'rb').read()
    n = struct.unpack('<I', b[:4])[0]
    head = json.loads(b[8:8 + n])
    off = 8 + n
    acc, years, lat, lon = defaultdict(list), defaultdict(set), None, None
    for item in head:
        raw = b[off:off + item['length']]; off += item['length']
        _, var, year = item['name'][:-3].split('_')
        with netcdf_file(io.BytesIO(raw), 'r', mmap=False, maskandscale=True) as nc:
            v = nc.variables[var]
            a = np.ma.filled(np.ma.asarray(v[:], dtype='float64'), np.nan)  # masked (missing) values -> NaN
            if a.shape[0] != 12:
                raise SystemExit(f"{item['name']}: {a.shape[0]} time steps")
            la, lo = np.array(nc.variables['lat'][:]), np.array(nc.variables['lon'][:])
        if lat is None:
            lat, lon = la, lo
        elif not (np.allclose(lat, la) and np.allclose(lon, lo)):
            raise SystemExit(f"{item['name']}: grid differs")
        acc[var].append(a); years[var].add(int(year))
    res = {'lat': lat.astype('float64'), 'lon': lon.astype('float64')}
    for var in VARS:
        if sorted(years[var]) != list(range(1991, 2021)):
            raise SystemExit(f'{var}: years {sorted(years[var])}')
        res[var] = np.mean(np.stack(acc[var]), axis=0).astype('float32')
        print(var, res[var].shape, float(np.nanmin(res[var])), float(np.nanmax(res[var])))
    np.savez_compressed(out, **res)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
