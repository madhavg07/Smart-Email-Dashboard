import py_compile, pathlib
errs=0
for p in pathlib.Path('Backend').rglob('*.py'):
    try:
        py_compile.compile(str(p), doraise=True)
    except Exception as e:
        print('FAIL:', p, e)
        errs+=1
print('COMPILE_ERRORS:', errs)
