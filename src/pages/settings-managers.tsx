import * as React from 'react';
import { Loader2, Monitor, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorMessage } from '@/lib/api';
import { PERMISSIONS, PERMISSION_KEYS, type Permission } from '../../shared/permissions.js';

interface Manager {
  id: string;
  name: string;
  phone: string;
  username: string | null;
  role: string;
  permissions: Permission[];
  active: boolean;
  note: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}


interface SessionRow {
  id: string;
  name: string;
  phone: string;
  role: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

interface LoginRow {
  id: string;
  description: string;
  createdAt: string;
}

/** Monitoring: siapa yang sedang masuk dan riwayat login manajer. */
function SessionMonitor() {
  const [data, setData] = React.useState<{ active: SessionRow[]; logins: LoginRow[] } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<{ active: SessionRow[]; logins: LoginRow[] }>('/managers/sessions'));
    } catch (error) {
      toast.error('Gagal memuat monitoring', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const when = (iso: string) => new Date(iso).toLocaleString('id-ID');

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Monitor className="h-4 w-4 text-primary" /> Monitoring login
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Sesi aktif dan riwayat masuk manajer.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Muat ulang
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
            Sesi aktif {data ? `(${data.active.length})` : ''}
          </p>
          {loading ? (
            <p className="mt-1 text-[10px] text-muted-foreground">Memuat…</p>
          ) : !data || data.active.length === 0 ? (
            <p className="mt-1 text-[10px] text-muted-foreground">Tidak ada sesi aktif.</p>
          ) : (
            <div className="mt-1 space-y-1.5">
              {data.active.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-[10px]"
                >
                  <div>
                    <p className="font-semibold">
                      {row.name} <span className="font-mono text-[9px] text-muted-foreground">{row.phone}</span>
                    </p>
                    <p className="text-[8px] text-muted-foreground">
                      Masuk {when(row.createdAt)} · IP {row.ip ?? '-'} · berakhir {when(row.expiresAt)}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[8px]">
                    {row.role === 'ADMIN' ? 'Admin' : 'Manajer'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Riwayat login terakhir</p>
          {!data || data.logins.length === 0 ? (
            <p className="mt-1 text-[10px] text-muted-foreground">Belum ada riwayat.</p>
          ) : (
            <div className="mt-1 max-h-40 space-y-1 overflow-auto">
              {data.logins.map((row) => (
                <p key={row.id} className="text-[9px] text-muted-foreground">
                  <span className="font-mono">{when(row.createdAt)}</span> · {row.description}
                </p>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ManagersPanel() {
  const [managers, setManagers] = React.useState<Manager[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editUsername, setEditUsername] = React.useState('');
  const [editPassword, setEditPassword] = React.useState('');
  const [selected, setSelected] = React.useState<Permission[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setManagers(await api.get<Manager[]>('/managers'));
    } catch (error) {
      toast.error('Gagal memuat manajer', { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggle = (permission: Permission) => {
    setSelected((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission]
    );
  };

  const add = async () => {
    if (name.trim().length < 2) {
      toast.error('Nama minimal 2 karakter');
      return;
    }
    if (phone.replace(/\D/g, '').length < 9) {
      toast.error('Nomor HP tidak valid', { description: 'Contoh: 082181281252' });
      return;
    }
    if (username.trim() && !/^[A-Za-z0-9._-]{3,32}$/.test(username.trim())) {
      toast.error('Username tidak valid', {
        description: '3–32 karakter: huruf, angka, titik, garis bawah, atau strip.'
      });
      return;
    }
    if (password && password.length < 8) {
      toast.error('Password minimal 8 karakter');
      return;
    }
    setSaving(true);
    try {
      await api.post<Manager>('/managers', {
        name,
        phone,
        permissions: selected,
        username: username.trim() || null,
        password: password || null
      });
      toast.success('Manajer ditambahkan', {
        description: 'Manajer bisa masuk dengan username/password atau nomor HP + OTP.'
      });
      setName('');
      setPhone('');
      setUsername('');
      setPassword('');
      setSelected([]);
      await load();
    } catch (error) {
      toast.error('Gagal menambah manajer', { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const update = async (
    manager: Manager,
    patch: Partial<Pick<Manager, 'permissions' | 'active' | 'username'>> & { password?: string | null }
  ) => {
    try {
      await api.patch<Manager>(`/managers/${manager.id}`, patch);
      await load();
      toast.success('Perubahan disimpan');
    } catch (error) {
      toast.error('Gagal menyimpan', { description: errorMessage(error) });
    }
  };

  const saveCredentials = async (manager: Manager) => {
    const nextUsername = editUsername.trim();
    if (nextUsername && !/^[A-Za-z0-9._-]{3,32}$/.test(nextUsername)) {
      toast.error('Username tidak valid', {
        description: '3–32 karakter: huruf, angka, titik, garis bawah, atau strip.'
      });
      return;
    }
    if (editPassword && editPassword.length < 8) {
      toast.error('Password minimal 8 karakter');
      return;
    }
    await update(manager, {
      username: nextUsername || null,
      ...(editPassword ? { password: editPassword } : {})
    });
    setEditingId(null);
    setEditPassword('');
  };

  const revoke = async (manager: Manager) => {
    try {
      const result = await api.post<{ revoked: number }>(`/managers/${manager.id}/revoke`, {});
      toast.success('Sesi dicabut', { description: `${result.revoked} sesi aktif dihentikan.` });
    } catch (error) {
      toast.error('Gagal mencabut sesi', { description: errorMessage(error) });
    }
  };

  const remove = async (manager: Manager) => {
    try {
      await api.delete(`/managers/${manager.id}`);
      toast.success('Manajer dihapus');
      await load();
    } catch (error) {
      toast.error('Gagal menghapus', { description: errorMessage(error) });
    }
  };

  return (
    <div className="space-y-4">
      <SessionMonitor />
      <Card>
        <CardHeader className="pb-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-primary" /> Tambah manajer
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Manajer masuk lewat halaman <b>/login</b> memakai nomor ini dan kode OTP WhatsApp.
            Pilih izin yang Anda setujui.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Nama</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nama manajer"
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Nomor HP</Label>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="082181281252"
                inputMode="tel"
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Username (opsional)
              </Label>
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="mis. budi.santoso"
                autoComplete="off"
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Password (opsional)
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="minimal 8 karakter"
                autoComplete="new-password"
                className="mt-1 h-9 text-xs"
              />
            </div>
          </div>

          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Izin yang disetujui</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {PERMISSION_KEYS.map((permission) => (
                <label
                  key={permission}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-muted/15 p-2 text-[10px]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(permission)}
                    onChange={() => toggle(permission)}
                    className="mt-0.5 h-3.5 w-3.5 accent-primary"
                  />
                  <span>
                    <span className="font-medium">{PERMISSIONS[permission]}</span>
                    <span className="block text-[8px] text-muted-foreground">{permission}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={() => void add()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Daftarkan manajer
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Manajer terdaftar
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Admin memiliki akses penuh dan tidak tampil di sini.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-[11px] text-muted-foreground">Memuat…</p>
          ) : managers.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Belum ada manajer terdaftar.</p>
          ) : (
            <div className="space-y-2">
              {managers.map((manager) => (
                <div
                  key={manager.id}
                  className="rounded-lg border border-border/60 bg-muted/10 p-3 text-[10px]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold">{manager.name}</p>
                      <p className="font-mono text-[9px] text-muted-foreground">{manager.phone}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {manager.username ? `username: ${manager.username}` : 'username: — (login via OTP)'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={manager.active ? 'outline' : 'secondary'} className="text-[8px]">
                        {manager.active ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[9px]"
                        onClick={() => void update(manager, { active: !manager.active })}
                      >
                        {manager.active ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[9px]"
                        onClick={() => void revoke(manager)}
                      >
                        Cabut sesi
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-destructive hover:text-destructive"
                        onClick={() => void remove(manager)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {PERMISSION_KEYS.map((permission) => {
                      const on = manager.permissions.includes(permission);
                      return (
                        <button
                          key={permission}
                          type="button"
                          onClick={() =>
                            void update(manager, {
                              permissions: on
                                ? manager.permissions.filter((value) => value !== permission)
                                : [...manager.permissions, permission]
                            })
                          }
                          className={
                            on
                              ? 'rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[8px] text-primary'
                              : 'rounded-full border border-border/60 px-2 py-0.5 text-[8px] text-muted-foreground'
                          }
                        >
                          {permission}
                        </button>
                      );
                    })}
                  </div>

                  {editingId === manager.id ? (
                    <div className="mt-2 grid gap-2 rounded-md border border-border/60 bg-background/60 p-2 sm:grid-cols-2">
                      <Input
                        value={editUsername}
                        onChange={(event) => setEditUsername(event.target.value)}
                        placeholder="username"
                        className="h-8 text-[11px]"
                      />
                      <Input
                        type="password"
                        value={editPassword}
                        onChange={(event) => setEditPassword(event.target.value)}
                        placeholder="password baru (opsional)"
                        className="h-8 text-[11px]"
                      />
                      <div className="flex gap-2 sm:col-span-2">
                        <Button size="sm" className="h-7 px-3 text-[10px]" onClick={() => void saveCredentials(manager)}>
                          Simpan kredensial
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-3 text-[10px]"
                          onClick={() => {
                            setEditingId(null);
                            setEditPassword('');
                          }}
                        >
                          Batal
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="mt-2 text-[9px] font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => {
                        setEditingId(manager.id);
                        setEditUsername(manager.username ?? '');
                        setEditPassword('');
                      }}
                    >
                      Atur kredensial login
                    </button>
                  )}

                  {manager.lastLoginAt ? (
                    <p className="mt-1.5 text-[8px] text-muted-foreground">
                      Terakhir masuk: {new Date(manager.lastLoginAt).toLocaleString('id-ID')}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
