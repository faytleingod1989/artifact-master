param([Int64]$WindowHandle = 0, [string]$AnalyzeImage = '', [string]$DiagnosticsDir = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing,System.Core -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading;
public class ArtifactPageScanner : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx,dy; public uint mouseData,flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mouse; }
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT rect);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dest,int x,int y,int w,int h,IntPtr src,int sx,int sy,uint rop);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] inputs,int size);
  // Versions are reported with every observation so a paused page can be traced
  // to the exact matcher that produced it (packaged script vs. source drift).
  public const string ScriptVersion="pagescan-diag-20261110";
  public const string MatcherVersion="match-20261101-loose";
  public class Cell { public string id; public int row,col,rarity=5; public bool selected; public bool? gameLocked; internal bool emphasized; internal Rectangle rect; internal byte[] appearance,canonical; }
  // Diagnostic only: why ONE fixed card did not match its sealed reference.
  // raw = unnormalized 1.00x, norm = best normalized pose. Each array is
  // [upperNcc,upperMae,lowerNcc,lowerMae,levelNcc,levelMae]. Never used to accept.
  public class CellMatch { public string id,branch; public bool referenceEmphasized,currentEmphasized; public double pose; public double[] raw,norm; }
  public class Observation { public int width,height; public long frameSequence; public bool foreground,validLayout,emergencyStop; public string geometryKey="",pageSignature="",gridSignature="",detailSignature="",selectedCellId; public Cell[] cells=new Cell[0];
    public string pageStatus="UNKNOWN",scriptVersion=ScriptVersion,matcherVersion=MatcherVersion,layoutIssue="",selectionCandidate; public double selectionBest,selectionRunnerUp,grabMs,analyzeMs; public CellMatch[] mismatches=new CellMatch[0]; }
  public static void RejectCursorOverlap(Observation value,int x,int y) {
    if(value==null)return;
    bool unsafePointer=x<0||y<0||value.cells.Any(cell=>{
      var r=cell.rect;int margin=Math.Max(3,Math.Min(r.Width,r.Height)/30);
      return x>=r.Left-margin&&x<=r.Right+margin&&y>=r.Top-margin&&y<=r.Top+r.Height*1.19+margin;
    });
    if(unsafePointer){value.selectedCellId=null;foreach(var cell in value.cells)cell.selected=false;}
  }
  bool ReadPointer(out POINT pointer) {
    pointer=new POINT();return GetCursorPos(out pointer)&&ScreenToClient(handle,ref pointer);
  }
  void GuardPointer(Observation value,POINT before,bool beforeOk) {
    POINT after;bool afterOk=ReadPointer(out after);
    if(!beforeOk||!afterOk){RejectCursorOverlap(value,-1,-1);return;}
    RejectCursorOverlap(value,before.X,before.Y);RejectCursorOverlap(value,after.X,after.Y);
  }
  readonly IntPtr handle; readonly uint processId; readonly long started; readonly Timer stopTimer;
  volatile bool paused=true, emergency=false;
  Observation last; long sequence;
  Cell[] gridAnchor; string anchorGeometry;
  public uint ProcessId { get { return processId; } }
  public string Started { get { return started.ToString(); } }
  public ArtifactPageScanner(long value) {
    SetProcessDPIAware(); handle=new IntPtr(value);
    if(!IsWindow(handle)) throw new Exception("SOURCE_CHANGED");
    GetWindowThreadProcessId(handle,out processId);
    var process=Process.GetProcessById((int)processId);
    if(!String.Equals(process.ProcessName,"YuanShen",StringComparison.OrdinalIgnoreCase) && !String.Equals(process.ProcessName,"GenshinImpact",StringComparison.OrdinalIgnoreCase)) throw new Exception("NOT_GENSHIN_PROCESS");
    started=process.StartTime.ToUniversalTime().Ticks;
    stopTimer=new Timer(delegate(object state) { if((GetAsyncKeyState(2)&0x8000)!=0) { emergency=true; paused=true; } },null,0,25);
  }
  void Check(bool foreground) {
    uint owner;
    if(!IsWindow(handle) || GetWindowThreadProcessId(handle,out owner)==0 || owner!=processId || Process.GetProcessById((int)owner).StartTime.ToUniversalTime().Ticks!=started) throw new Exception("SOURCE_CHANGED");
    if(foreground && (IsIconic(handle)||!IsWindowVisible(handle)||GetForegroundWindow()!=handle)) throw new Exception("FOCUS_LOST");
  }
  string Geometry(out int width,out int height) {
    RECT rect; POINT point=new POINT();
    if(!GetClientRect(handle,out rect)||!ClientToScreen(handle,ref point)) throw new Exception("SOURCE_CHANGED");
    width=rect.Right-rect.Left; height=rect.Bottom-rect.Top;
    if(width<320||height<240||width>4096||height>4096||(long)width*height>8388608) throw new Exception("UNSUPPORTED_SIZE");
    return width+"x"+height+"@"+point.X+","+point.Y;
  }
  Bitmap Grab() {
    Check(true); int width,height; Geometry(out width,out height);
    var bitmap=new Bitmap(width,height,PixelFormat.Format32bppArgb); IntPtr source=GetDC(handle);
    if(source==IntPtr.Zero) { bitmap.Dispose(); throw new Exception("FRAME_UNAVAILABLE"); }
    try { using(var graphics=Graphics.FromImage(bitmap)) { IntPtr target=graphics.GetHdc(); try { if(!BitBlt(target,0,0,width,height,source,0,0,0x00CC0020)) throw new Exception("FRAME_UNAVAILABLE"); } finally { graphics.ReleaseHdc(target); } } Check(true); return bitmap; }
    catch { bitmap.Dispose(); throw; }
    finally { ReleaseDC(handle,source); }
  }
  static byte[] Pixels(Bitmap bitmap) {
    var locked=bitmap.LockBits(new Rectangle(0,0,bitmap.Width,bitmap.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
    try { if(locked.Stride!=bitmap.Width*4) throw new Exception("UNSUPPORTED_PIXELS"); var pixels=new byte[locked.Stride*bitmap.Height]; Marshal.Copy(locked.Scan0,pixels,0,pixels.Length); return pixels; }
    finally { bitmap.UnlockBits(locked); }
  }
  static bool Gold(byte[] p,int i) { int b=p[i],g=p[i+1],r=p[i+2]; return r>100&&g>65&&r>g*1.08&&g>b*1.20&&b<r*.75; }
  static bool Bright(byte[] p,int i) { int b=p[i],g=p[i+1],r=p[i+2]; return Math.Min(r,Math.Min(g,b))>205&&Math.Max(r,Math.Max(g,b))-Math.Min(r,Math.Min(g,b))<60; }
  static List<int[]> Runs(List<int> values,int gap) {
    var result=new List<int[]>();
    foreach(int value in values) { if(result.Count==0||value-result[result.Count-1][1]>gap) result.Add(new int[]{value,value}); else result[result.Count-1][1]=value; }
    return result;
  }
  static uint Mix(uint hash,int value) { unchecked { return (hash^(uint)value)*16777619; } }
  const int AppearanceBytes=32*48*3;
  static byte[] ReadAppearance(byte[] pixels,int width,int height,Rectangle r,double scale=1) {
    int left=r.Left+(int)(r.Width*.15),right=r.Left+(int)(r.Width*.85);
    int top=r.Top+(int)(r.Height*.24),bottom=r.Top+(int)(r.Height*1.19);
    if(left<0||top<0||right>width||bottom>height||right<=left||bottom<=top)return null;
    double cx=r.Left+r.Width*.5,cy=r.Top+r.Height*.60;
    if(scale!=1&&(cx+(left-cx)*scale<0||cy+(top-cy)*scale<0||cx+(right-1-cx)*scale>=width-1||cy+(bottom-1-cy)*scale>=height-1))return null;
    var result=new byte[AppearanceBytes];int index=0;
    for(int row=0;row<48;row++)for(int col=0;col<32;col++) {
      int x0=left+col*(right-left)/32,x1=Math.Min(right,Math.Max(x0+1,left+(col+1)*(right-left)/32));
      int y0=top+row*(bottom-top)/48,y1=Math.Min(bottom,Math.Max(y0+1,top+(row+1)*(bottom-top)/48));
      for(int channel=0;channel<3;channel++) {
        double sum=0;for(int y=y0;y<y1;y++)for(int x=x0;x<x1;x++){
          if(scale==1)sum+=pixels[(y*width+x)*4+channel];
          else{
            double sx=cx+(x-cx)*scale,sy=cy+(y-cy)*scale;int ix=(int)Math.Floor(sx),iy=(int)Math.Floor(sy);double fx=sx-ix,fy=sy-iy;
            sum+=pixels[(iy*width+ix)*4+channel]*(1-fx)*(1-fy)+pixels[(iy*width+ix+1)*4+channel]*fx*(1-fy)+pixels[((iy+1)*width+ix)*4+channel]*(1-fx)*fy+pixels[((iy+1)*width+ix+1)*4+channel]*fx*fy;
          }
        }
        result[index++]=(byte)(sum/((x1-x0)*(y1-y0)));
      }
    }
    return result;
  }
  static byte[] NormalizeAppearance(byte[] source) {
    if(source==null||source.Length!=AppearanceBytes)return null;
    var result=(byte[])source.Clone();
    var tones=new int[7*30];int n=0;
    for(int y=40;y<47;y++)for(int x=1;x<31;x++){int i=(y*32+x)*3;tones[n++]=(result[i]+result[i+1]+result[i+2])/3;}
    Array.Sort(tones);int background=tones[(int)(tones.Length*.80)],foreground=tones[(int)(tones.Length*.05)],contrast=background-foreground;
    if(contrast<32)return null;
    // Grade ink, not the selected brown/unselected gray font palette. Keep the
    // glyph's fixed position and shape; do not classify or resize its characters.
    for(int y=38;y<48;y++)for(int x=0;x<32;x++){
      int i=(y*32+x)*3,tone=(result[i]+result[i+1]+result[i+2])/3;
      byte ink=(byte)Math.Max(0,Math.Min(255,(background-tone)*255.0/contrast));result[i]=result[i+1]=result[i+2]=ink;
    }
    return result;
  }
  static byte[] StateAppearance(byte[] pixels,int width,int height,Rectangle sample,Cell cell) {
    // Exactly two known UI states, not a search over arbitrary transforms.
    return NormalizeAppearance(cell.emphasized?ReadAppearance(pixels,width,height,sample,1.05):cell.appearance);
  }
  static bool SameBand(byte[] a,byte[] b,int first,int end,double correlation,double limit=3.5) {
    double ncc,mae;return BandMetrics(a,b,first,end,out ncc,out mae)&&mae<=limit&&ncc>=correlation;
  }
  static bool BandMetrics(byte[] a,byte[] b,int first,int end,out double ncc,out double mae) {
    double dot=0,varianceA=0,varianceB=0,difference=0;int count=(end-first)*30;
    for(int channel=0;channel<3;channel++) {
      double sumA=0,sumB=0,squareA=0,squareB=0,product=0;
      for(int y=first;y<end;y++)for(int x=1;x<31;x++) {
        int i=(y*32+x)*3+channel;double av=a[i],bv=b[i];
        difference+=Math.Abs(av-bv);sumA+=av;sumB+=bv;squareA+=av*av;squareB+=bv*bv;product+=av*bv;
      }
      // Center each RGB channel separately: a shared gold background color
      // cannot masquerade as correlated icon/level structure.
      dot+=product-sumA*sumB/count;varianceA+=squareA-sumA*sumA/count;varianceB+=squareB-sumB*sumB/count;
    }
    mae=difference/(count*3);
    bool textured=varianceA>1&&varianceB>1;
    ncc=textured?dot/Math.Sqrt(varianceA*varianceB):0;
    return textured;
  }
  static double[] Bands(byte[] a,byte[] b) {
    if(a==null||b==null)return null;
    var result=new double[6];int index=0;
    foreach(var band in new int[][]{new[]{1,22},new[]{22,33},new[]{40,47}}) {
      double ncc,mae;BandMetrics(a,b,band[0],band[1],out ncc,out mae);
      result[index++]=Math.Round(ncc,4);result[index++]=Math.Round(mae,2);
    }
    return result;
  }
  static CellMatch Explain(Cell reference,Cell current,double bestPose,double[] bestNorm) {
    // Runs only for a card that already FAILED every acceptance branch.
    // Reuses the best pose metrics already evaluated during Analyze so failing
    // frames never resample the 11 poses a second time.
    var match=new CellMatch{id=current.id,referenceEmphasized=reference.emphasized,currentEmphasized=current.emphasized,pose=bestPose,norm=bestNorm};
    match.raw=Bands(reference.appearance,current.appearance);
    if(reference.canonical==null){match.branch="reference-level-unreadable";return match;}
    if(match.norm==null){match.branch="current-level-unreadable";return match;}
    var n=match.norm;
    match.branch=n[0]<.92||n[1]>15.0?"upper-icon":n[2]<.88||n[3]>20.0?"lower-icon":n[4]<.92||n[5]>14.0?"level":"near-threshold";
    return match;
  }
  static bool SameCanonical(byte[] a,byte[] b) {
    // Resampling a small level glyph changes both ink intensity and shape;
    // bound both differences while preserving separate full-icon evidence.
    return a!=null&&b!=null&&SameBand(a,b,1,22,.92,15.0)&&SameBand(a,b,22,33,.88,20.0)&&SameBand(a,b,40,47,.92,14.0);
  }
  static bool SameAppearance(Cell reference,Cell current) {
    var a=reference.appearance;var b=current.appearance;
    if(a==null||b==null||a.Length!=AppearanceBytes||b.Length!=AppearanceBytes)return false;
    if(a.SequenceEqual(b))return true;
    if(SameBand(a,b,1,33,.995)&&SameBand(a,b,40,47,.97))return true;
    if(!reference.emphasized&&!current.emphasized&&SameBand(a,b,1,22,.95,12.0)&&SameBand(a,b,22,33,.88,20.0)&&SameBand(a,b,40,47,.94,10.0))return true;
    if((!reference.emphasized&&!current.emphasized)||reference.canonical==null||current.canonical==null)return false;
    if(SameCanonical(reference.canonical,current.canonical))return true;
    return reference.emphasized&&current.emphasized&&(SameCanonical(NormalizeAppearance(a),current.canonical)||SameCanonical(reference.canonical,NormalizeAppearance(b)));
  }
  static bool CompleteProjectedCard(byte[] p,int width,int height,Rectangle r,int step) {
    // Projection is a candidate, never permission to click. Require five
    // separated star shapes AND a light level footer containing dark text.
    if(r.Left<0||r.Right>width||r.Top<0||r.Top+r.Height*1.19>height*.90)return false;
    var starColumns=new List<int>();
    for(int x=r.Left;x<r.Right;x+=step) {
      int yellow=0;for(int y=r.Top+(int)(r.Height*.80);y<r.Top+r.Height*1.025;y+=step) {
        int i=(y*width+x)*4;if(p[i+2]>235&&p[i+1]>165&&p[i]<110)yellow++;
      }
      if(yellow>=2)starColumns.Add(x);
    }
    var stars=Runs(starColumns,step);
    if(stars.Count!=5||stars[0][0]>r.Left+r.Width*.25||stars[4][1]<r.Left+r.Width*.75)return false;
    int light=0,dark=0,total=0;
    for(int y=r.Top+(int)(r.Height*1.04);y<r.Top+r.Height*1.18;y+=step)
      for(int x=r.Left+(int)(r.Width*.10);x<r.Left+r.Width*.90;x+=step) {
        int i=(y*width+x)*4,b=p[i],g=p[i+1],red=p[i+2];total++;
        if(Math.Min(red,Math.Min(g,b))>160&&Math.Max(red,Math.Max(g,b))-Math.Min(red,Math.Min(g,b))<75)light++;
        if(Math.Min(red,Math.Min(g,b))<145&&Math.Max(red,Math.Max(g,b))<205)dark++;
      }
    return total>0&&light>total*.70&&dark>total*.015;
  }
  public static Observation Analyze(Bitmap bitmap) { return Analyze(bitmap,null); }
  static Observation Analyze(Bitmap bitmap,Cell[] anchors) {
    int width=bitmap.Width,height=bitmap.Height,step=Math.Max(2,width/960); var p=Pixels(bitmap);
    var observation=new Observation { width=width,height=height,foreground=true };
    Func<string,Observation> reject=issue=>{
      observation.layoutIssue=issue.Length>160?issue.Substring(0,160):issue;
      observation.pageStatus=issue.StartsWith("GRID_SHIFT")||issue.StartsWith("EDGE_MOVED")||issue.StartsWith("CELL_COUNT_CHANGED")?"CHANGED":"UNKNOWN";
      return observation;
    };
    if(width<640||height<480||width/(double)height<1.3||width/(double)height>2.4) return reject("UNSUPPORTED_ASPECT "+width+"x"+height);
    int green=0,white=0;
    for(int y=(int)(height*.04);y<height*.75;y+=step) for(int x=(int)(width*.72);x<width*.99;x+=step) { int i=(y*width+x)*4; if(p[i+1]>170&&p[i+1]>p[i+2]*1.15&&p[i+1]>p[i]*1.1) green++; if(Bright(p,i)) white++; }
    if(green<width*height/(double)(step*step)*.0003||white<width*height/(double)(step*step)*.0005) return reject("NO_DETAIL_PANEL green="+green+" white="+white);
    var ys=new List<int>(); int xmax=(int)(width*.68);
    for(int y=(int)(height*.005);y<height*.90;y+=step) { int count=0; for(int x=0;x<width*.35;x+=step) if(Gold(p,(y*width+x)*4)) count++; if(count>=width*.025/step) ys.Add(y); }
    var rows=new List<List<Rectangle>>();
    foreach(var run in Runs(ys,step*2)) {
      int top=run[0],bottom=run[1]+step,h=bottom-top;
      if(h<height*.045||h>height*.25) continue;
      var xs=new List<int>();
      for(int x=0;x<xmax;x+=step) { int count=0; for(int y=top;y<bottom;y+=step) if(Gold(p,(y*width+x)*4)) count++; if(count>=h*.15/step) xs.Add(x); }
      var candidates=Runs(xs,step*2).Select(r=>new Rectangle(r[0],top,r[1]+step-r[0],h)).Where(r=>r.Width>=width*.035&&r.Width<=width*.16&&r.Width/(double)r.Height>.5&&r.Width/(double)r.Height<1.7).ToList();
      if(candidates.Count<1) continue;
      double median=candidates.Select(r=>r.Width).OrderBy(v=>v).ElementAt(candidates.Count/2);
      candidates=candidates.Where(r=>Math.Abs(r.Width-median)<median*.22).ToList();
      var line=new List<Rectangle>();
      foreach(var rect in candidates) { if(line.Count==0) { if(rect.Left>width*.10) break; } else { double gap=rect.Left-line[line.Count-1].Right; if(gap<step||gap>median*.6) break; } line.Add(rect); }
      if(line.Count>=1) rows.Add(line);
    }
    if(rows.Count==0||rows.Max(r=>r.Count)<2) return reject("NO_CARD_ROWS rows="+rows.Count);
    var longest=rows.OrderByDescending(r=>r.Count).First();
    var completeRows=rows.Where(r=>r.Count==longest.Count).OrderBy(r=>r[0].Top).ToList();
    if(completeRows.Count>=2) {
      // Selected-card borders expand symmetrically; row centers, not raw top
      // edges, establish spacing. Use the latest full row's normal rectangles.
      var latestRow=completeRows[completeRows.Count-1];
      var normalRow=completeRows.OrderBy(r=>r[0].Height).ThenByDescending(r=>r[0].Top).First();
      int spacing=(completeRows[1][0].Top+completeRows[1][0].Height/2)-(completeRows[0][0].Top+completeRows[0][0].Height/2),h=normalRow[0].Height;
      int latestTop=latestRow[0].Top+(latestRow[0].Height-h)/2;
      if(spacing>=h*.8&&spacing<=h*1.8) {
        for(int top=latestTop+spacing;top+h*1.19<=height*.90;top+=spacing) {
          if(rows.Any(line=>Math.Abs(line[0].Top-top)<=step*3))continue;
          var projected=new List<Rectangle>();
          foreach(var template in normalRow) {
            var candidate=new Rectangle(template.Left,top,template.Width,h);
            if(!CompleteProjectedCard(p,width,height,candidate,step))break;
            projected.Add(candidate);
          }
          // Do not claim a truncated page if a gap is followed by multiple
          // independently verified cards. Their missing neighbor is not safe
          // to click, so reject the whole observation and let the user retry.
          if(projected.Count<normalRow.Count) {
            int later=0;
            for(int col=projected.Count+1;col<normalRow.Count;col++) {
              var t=normalRow[col];
              if(CompleteProjectedCard(p,width,height,new Rectangle(t.Left,top,t.Width,h),step))later++;
            }
            if(later>=2)return reject("PROJECTED_ROW_GAP top="+top+" verified="+projected.Count+" later="+later);
          }
          if(projected.Count==0)break;
          rows.Add(projected);if(projected.Count<longest.Count)break;
        }
      }
    }
    var reference=rows.OrderByDescending(r=>r.Count).First(); var cells=new List<Cell>(); int rowIndex=0;
    double referenceWidth=reference[0].Width,referenceHeight=reference[0].Height;
    foreach(var row in rows.OrderBy(r=>r[0].Top)) {
      if(row[0].Top>height*.88||Math.Abs(row[0].Height-referenceHeight)>referenceHeight*.25) continue;
      if(rowIndex>0) { double gap=row[0].Top-cells.Where(c=>c.row==rowIndex-1).First().rect.Top; if(gap<referenceHeight*.8||gap>referenceHeight*1.8) break; }
      int found=0;
      for(int col=0;col<reference.Count;col++) {
        var matches=row.Where(r=>Math.Abs(r.Left-reference[col].Left)<referenceWidth*.08).ToList();
        if(matches.Count!=1) break;
        var rect=matches[0]; cells.Add(new Cell { id="r"+rowIndex+"c"+col,row=rowIndex,col=col,rect=rect }); found++;
      }
      if(found>0) rowIndex++;
    }
    if(cells.Count<2||cells.Count>60) return reject("CELL_COUNT "+cells.Count);
    if(anchors!=null) {
      if(anchors.Length!=cells.Count) return reject("CELL_COUNT_CHANGED "+anchors.Length+">"+cells.Count);
      var shiftsX=new List<double>();var shiftsY=new List<double>();
      for(int index=0;index<cells.Count;index++) {
        var current=cells[index];var saved=anchors[index];var r=current.rect;var a=saved.rect;
        double edgeLimit=Math.Max(step*3,Math.Min(a.Width,a.Height)*.045);
        if(current.id!=saved.id) return reject("CELL_ID_CHANGED "+saved.id+">"+current.id);
        if(Math.Abs(r.Left-a.Left)>edgeLimit||Math.Abs(r.Right-a.Right)>edgeLimit||Math.Abs(r.Top-a.Top)>edgeLimit||Math.Abs(r.Bottom-a.Bottom)>edgeLimit) return reject("EDGE_MOVED "+current.id+" dL="+(r.Left-a.Left)+" dR="+(r.Right-a.Right)+" dT="+(r.Top-a.Top)+" dB="+(r.Bottom-a.Bottom)+" limit="+Math.Round(edgeLimit,1));
        shiftsX.Add((r.Left+r.Right-a.Left-a.Right)/2.0);shiftsY.Add((r.Top+r.Bottom-a.Top-a.Bottom)/2.0);
      }
      // Local border growth is not scrolling. A coherent displacement of the
      // whole grid is, even if all items happen to have identical attributes.
      double medianX=shiftsX.OrderBy(v=>v).ElementAt(shiftsX.Count/2),medianY=shiftsY.OrderBy(v=>v).ElementAt(shiftsY.Count/2);
      if(Math.Abs(medianX)>step*.5||Math.Abs(medianY)>step*.5) return reject("GRID_SHIFT x="+medianX+" y="+medianY);
    }
    uint detail=2166136261; double best=0,runnerUp=0; Cell selected=null;
    var pageBytes=new MemoryStream(); var pageWriter=new BinaryWriter(pageBytes);
    var gridBytes=new MemoryStream(); var gridWriter=new BinaryWriter(gridBytes);
    foreach(var cell in cells) {
      var r=cell.rect; int hits=0,total=0,pink=0;
      for(int y=r.Top+r.Height/12;y<r.Bottom-r.Height/12;y+=step*2) {
        for(int side=0;side<2;side++) {
          int center=side==0?r.Left:r.Right,far=Math.Max(0,Math.Min(width-1,center+(side==0?-1:1)*step*8)),outside=(y*width+far)*4; bool bright=false;
          for(int dx=-step*2;dx<=step*2;dx+=step) {
            int x=Math.Max(0,Math.Min(width-1,center+dx)),i=(y*width+x)*4;
            // Equipment-screen selection has a cyan rim, not necessarily white.
            // Require a local increase in every channel relative to the exterior,
            // so the blue scene itself cannot act as a selected-card border.
            if(Bright(p,i)||(p[i]>160&&p[i+1]>140&&p[i]>=p[i+2]&&p[i]>p[outside]+18&&p[i+1]>p[outside+1]+18&&p[i+2]>p[outside+2]+18)) bright=true;
          }
          if(bright) hits++; total++;
        }
      }
      double score=total==0?0:hits/(double)total;
      // Hover and selection both enlarge a card. This visual state is per-cell;
      // it must not depend on finding one unique selected item. Selection below
      // remains conservative and is independently required before freezing.
      cell.emphasized=score>.40;
      if(score>best) { runnerUp=best; best=score; selected=cell; } else if(score>runnerUp) runnerUp=score;
      for(int y=r.Top+step;y<r.Top+r.Height*.22;y+=step) for(int x=r.Left+step;x<r.Left+r.Width*.22;x+=step) { int i=(y*width+x)*4; if(p[i+2]>210&&p[i+1]>85&&p[i+1]<180&&p[i]>85&&p[i]<170&&p[i]>p[i+1]*.65) pink++; }
      if(pink>4) cell.gameLocked=true;
      gridWriter.Write(cell.row);gridWriter.Write(cell.col);
      gridWriter.Write(r.Left);gridWriter.Write(r.Top);gridWriter.Write(r.Width);gridWriter.Write(r.Height);
    }
    if(best>.40&&best-runnerUp>.10&&selected!=null) { selected.selected=true; observation.selectedCellId=selected.id; }
    observation.selectionBest=Math.Round(best,3);observation.selectionRunnerUp=Math.Round(runnerUp,3);observation.selectionCandidate=selected==null?null:selected.id;
    var mismatches=new List<CellMatch>();
    foreach(var cell in cells) {
      var sample=anchors==null?cell.rect:anchors[cells.IndexOf(cell)].rect;
      pageWriter.Write(cell.row);pageWriter.Write(cell.col);
      pageWriter.Write(sample.Left);pageWriter.Write(sample.Top);pageWriter.Write(sample.Width);pageWriter.Write(sample.Height);
      // Preserve a page identity only when EVERY fixed card matches its sealed
      // reference. Do not hash transient rendering as physical page identity.
      // The level strip is checked separately, not hidden by the larger icon.
      cell.appearance=ReadAppearance(p,width,height,sample);
      if(cell.appearance==null)return reject("APPEARANCE_CLIPPED "+cell.id);
      // State-specific normalization is optional. An unreadable/clipped grade
      // disables that fallback; it must not erase otherwise valid strict proof.
      var referenceCell=anchors==null?null:anchors[cells.IndexOf(cell)];
      if(referenceCell==null||referenceCell.emphasized||cell.emphasized)cell.canonical=StateAppearance(p,width,height,sample,cell);
      bool same=referenceCell!=null&&SameAppearance(referenceCell,cell);
      double bestPose=1;double[] bestNorm=null;
      if(referenceCell!=null&&referenceCell.canonical!=null&&!same) {
        // Selection and hover transitions also animate nearby cards at
        // intermediate scales. Compare the same fixed card center within a
        // bounded 5% scale range, retaining colored icon and level evidence.
        // Never replace the sealed reference or accept missing grade evidence.
        var original=NormalizeAppearance(referenceCell.appearance);
        var normalizedCurrent=NormalizeAppearance(cell.appearance);
        double bestScore=double.NegativeInfinity;
        foreach(double pose in new double[]{1.0,1.05,1.03,1.02,1.04,1.01,.99,.98,.97,.96,.95}) {
          var variant=pose==1.0?normalizedCurrent:NormalizeAppearance(ReadAppearance(p,width,height,sample,pose));
          if(variant==null)continue;
          if(SameCanonical(original,variant)||SameCanonical(referenceCell.canonical,variant)){same=true;break;}
          if(mismatches.Count<8) {
            foreach(var target in new byte[][]{original,referenceCell.canonical}) {
              var bands=Bands(target,variant);if(bands==null)continue;
              double score=bands[0]+bands[2]+bands[4];
              if(score>bestScore){bestScore=score;bestNorm=bands;bestPose=pose;}
            }
          }
        }
      }
      pageWriter.Write(same?referenceCell.appearance:cell.appearance);
      if(referenceCell!=null&&!same)mismatches.Add(mismatches.Count<8?Explain(referenceCell,cell,bestPose,bestNorm):new CellMatch{id=cell.id,branch="not-explained",referenceEmphasized=referenceCell.emphasized,currentEmphasized=cell.emphasized,pose=1,raw=Bands(referenceCell.appearance,cell.appearance)});
      cell.rect=sample;
    }
    observation.mismatches=mismatches.ToArray();
    observation.pageStatus=mismatches.Count==0?"SAME":mismatches.Count<=2&&mismatches.All(m=>m.norm!=null&&m.norm[0]>=.80&&m.norm[2]>=.75&&m.norm[4]>=.80)?"TRANSIENT":"CHANGED";
    for(int row=0;row<18;row++) for(int col=0;col<7;col++) {
      int x=(int)(width*(.76+col*.028)),y=(int)(height*(.04+row*.034)); int count=0;
      for(int dy=0;dy<Math.Max(2,height/90);dy+=step) for(int dx=0;dx<Math.Max(2,width/100);dx+=step) if(Bright(p,((y+dy)*width+x+dx)*4)) count++;
      detail=Mix(detail,count/4);
    }
    string pageSignature;
    using(var sha=SHA256.Create()) {
      pageSignature=BitConverter.ToString(sha.ComputeHash(pageBytes.ToArray())).Replace("-","").ToLowerInvariant();
      observation.gridSignature=BitConverter.ToString(sha.ComputeHash(gridBytes.ToArray())).Replace("-","").ToLowerInvariant();
    }
    pageWriter.Dispose();pageBytes.Dispose();
    gridWriter.Dispose();gridBytes.Dispose();
    observation.cells=cells.ToArray(); observation.validLayout=true; observation.pageSignature=pageSignature; observation.detailSignature=detail.ToString("x8"); return observation;
  }
  // ---- Local, bounded diagnostics (never uploaded, never deletes files) ----
  // One session directory per helper process: events.jsonl plus JPEG frames
  // for the sealed reference and for rejected/mismatching frames only.
  string diagnosticsDir; StreamWriter diagnosticsLog; long diagnosticsLogBytes, diagnosticsFrameBytes; int diagnosticsFrames; long lastMismatchFrame;
  const int MaxDiagnosticFrames=60; const long MaxDiagnosticFrameBytes=400L*1024*1024, MaxDiagnosticLogBytes=8L*1024*1024;
  readonly Stopwatch clock=Stopwatch.StartNew();
  public string DiagnosticsPath { get { return diagnosticsDir??""; } }
  public void EnableDiagnostics(string root,string scriptHash) {
    if(String.IsNullOrEmpty(root)||diagnosticsDir!=null)return;
    try {
      var dir=Path.Combine(root,"session-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+"-"+processId);
      Directory.CreateDirectory(dir);diagnosticsDir=dir;
      diagnosticsLog=new StreamWriter(Path.Combine(dir,"events.jsonl"),false,new System.Text.UTF8Encoding(false));diagnosticsLog.AutoFlush=true;
      File.WriteAllText(Path.Combine(dir,"manifest.json"),"{\"scriptVersion\":\""+ScriptVersion+"\",\"matcherVersion\":\""+MatcherVersion+"\",\"scriptSha256\":\""+Esc(scriptHash)+"\",\"pid\":"+processId+",\"started\":\""+started+"\",\"createdLocal\":\""+DateTime.Now.ToString("o")+"\",\"limits\":{\"frames\":"+MaxDiagnosticFrames+",\"frameBytes\":"+MaxDiagnosticFrameBytes+",\"logBytes\":"+MaxDiagnosticLogBytes+"}}",new System.Text.UTF8Encoding(false));
    } catch { diagnosticsDir=null; diagnosticsLog=null; }
  }
  static string Esc(string value) { if(value==null)return ""; var b=new System.Text.StringBuilder(); foreach(char c in value){ if(c=='"'||c=='\\'){b.Append('\\').Append(c);} else if(c<32){b.Append(' ');} else b.Append(c);} return b.ToString(); }
  static string Nums(double[] values) { return values==null?"null":"["+String.Join(",",values.Select(v=>v.ToString("0.####",System.Globalization.CultureInfo.InvariantCulture)))+"]"; }
  static string F(double value) { return value.ToString("0.###",System.Globalization.CultureInfo.InvariantCulture); }
  public void LogEvent(string action,string detail) { WriteEvent(action,null,0,0,detail,null); }
  void WriteEvent(string action,Observation o,double grabMs,double analyzeMs,string error,string frame) {
    if(diagnosticsLog==null||diagnosticsLogBytes>MaxDiagnosticLogBytes)return;
    try {
      var b=new System.Text.StringBuilder();
      b.Append("{\"t\":").Append(F(clock.Elapsed.TotalMilliseconds)).Append(",\"action\":\"").Append(Esc(action)).Append('"');
      if(o!=null) {
        b.Append(",\"seq\":").Append(o.frameSequence).Append(",\"fg\":").Append(o.foreground?"true":"false").Append(",\"valid\":").Append(o.validLayout?"true":"false");
        b.Append(",\"status\":\"").Append(Esc(o.pageStatus)).Append("\",\"issue\":\"").Append(Esc(o.layoutIssue)).Append("\",\"cells\":").Append(o.cells.Length);
        b.Append(",\"selected\":\"").Append(Esc(o.selectedCellId)).Append("\",\"candidate\":\"").Append(Esc(o.selectionCandidate)).Append("\",\"best\":").Append(F(o.selectionBest)).Append(",\"runnerUp\":").Append(F(o.selectionRunnerUp));
        b.Append(",\"page\":\"").Append(o.pageSignature.Length>=8?o.pageSignature.Substring(0,8):"").Append("\",\"grid\":\"").Append(o.gridSignature.Length>=8?o.gridSignature.Substring(0,8):"").Append("\",\"detail\":\"").Append(o.detailSignature).Append('"');
        b.Append(",\"grabMs\":").Append(F(grabMs)).Append(",\"analyzeMs\":").Append(F(analyzeMs));
        b.Append(",\"mismatches\":[");
        for(int i=0;i<o.mismatches.Length;i++){var m=o.mismatches[i];if(i>0)b.Append(',');b.Append("{\"id\":\"").Append(m.id).Append("\",\"branch\":\"").Append(m.branch).Append("\",\"refEmph\":").Append(m.referenceEmphasized?"true":"false").Append(",\"curEmph\":").Append(m.currentEmphasized?"true":"false").Append(",\"pose\":").Append(F(m.pose)).Append(",\"raw\":").Append(Nums(m.raw)).Append(",\"norm\":").Append(Nums(m.norm)).Append('}');}
        b.Append(']');
        POINT pointer;if(ReadPointer(out pointer))b.Append(",\"pointer\":[").Append(pointer.X).Append(',').Append(pointer.Y).Append(']');
      }
      if(!String.IsNullOrEmpty(error))b.Append(",\"error\":\"").Append(Esc(error.Length>300?error.Substring(0,300):error)).Append('"');
      if(frame!=null)b.Append(",\"frame\":\"").Append(Esc(frame)).Append('"');
      b.Append('}');
      var line=b.ToString();diagnosticsLogBytes+=line.Length+2;diagnosticsLog.WriteLine(line);
    } catch { }
  }
  string SaveFrame(Bitmap bitmap,string tag,bool throttled) {
    if(diagnosticsDir==null||diagnosticsFrames>=MaxDiagnosticFrames||diagnosticsFrameBytes>=MaxDiagnosticFrameBytes)return null;
    long nowMs=(long)clock.Elapsed.TotalMilliseconds;
    if(throttled&&nowMs-lastMismatchFrame<250)return null;
    if(throttled)lastMismatchFrame=nowMs;
    try {
      var name=(++diagnosticsFrames).ToString("000")+"-"+tag+".jpg";var file=Path.Combine(diagnosticsDir,name);
      var codec=ImageCodecInfo.GetImageEncoders().First(c=>c.FormatID==ImageFormat.Jpeg.Guid);
      using(var parameters=new EncoderParameters(1)){parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,85L);bitmap.Save(file,codec,parameters);}
      diagnosticsFrameBytes+=new FileInfo(file).Length;return name;
    } catch { return null; }
  }
  static string Summary(Observation o) {
    if(!o.validLayout)return "layout "+o.layoutIssue;
    var parts=o.mismatches.Take(6).Select(m=>m.id+"/"+m.branch+(m.norm!=null?"(u"+F(m.norm[0])+"/"+F(m.norm[1])+" d"+F(m.norm[2])+"/"+F(m.norm[3])+" lv"+F(m.norm[4])+"/"+F(m.norm[5])+")":""));
    return "n="+o.mismatches.Length+" "+String.Join(" ",parts);
  }
  public Observation Observe() {
    Check(false); int width,height; string geometry=Geometry(out width,out height);
    if(gridAnchor!=null&&geometry!=anchorGeometry) throw new Exception("GEOMETRY_CHANGED");
    if(GetForegroundWindow()!=handle||IsIconic(handle)) { var away=new Observation { width=width,height=height,geometryKey=geometry,frameSequence=++sequence,foreground=false,emergencyStop=emergency,layoutIssue="NOT_FOREGROUND" }; WriteEvent("observe",away,0,0,null,null); return away; }
    POINT pointer;bool pointerOk=ReadPointer(out pointer);
    var watch=Stopwatch.StartNew();
    using(var bitmap=Grab()) {
      double grabMs=watch.Elapsed.TotalMilliseconds;
      var current=Analyze(bitmap,gridAnchor); GuardPointer(current,pointer,pointerOk); current.geometryKey=geometry; current.frameSequence=++sequence; current.emergencyStop=emergency;
      current.grabMs=Math.Round(grabMs,1);current.analyzeMs=Math.Round(watch.Elapsed.TotalMilliseconds-grabMs,1);
      string frame=null;
      if(gridAnchor!=null&&(current.mismatches.Length>0||!current.validLayout))frame=SaveFrame(bitmap,"observe-"+current.frameSequence+(current.validLayout?"-mismatch":"-layout"),true);
      WriteEvent("observe",current,current.grabMs,current.analyzeMs,null,frame);
      last=current; return current;
    }
  }
  void InputReady() { Check(true); if(paused||emergency||(GetAsyncKeyState(2)&0x8000)!=0) throw new Exception("INPUT_PAUSED"); if(last==null||!last.validLayout) throw new Exception("UNKNOWN_LAYOUT"); int w,h; string geometry=Geometry(out w,out h);if(geometry!=last.geometryKey||(gridAnchor!=null&&geometry!=anchorGeometry)) throw new Exception("GEOMETRY_CHANGED"); }
  public string Anchor() {
    InputReady();
    if(gridAnchor==null) {
      using(var bitmap=Grab()) {
        var current=Analyze(bitmap,last.cells);
        if(!current.validLayout||current.pageSignature!=last.pageSignature){var code=(current.validLayout?"PAGE_CHANGED:":"PAGE_UNCERTAIN:")+"anchor "+Summary(current);WriteEvent("anchor",current,0,0,code,SaveFrame(bitmap,"anchor-rejected",false));throw new Exception(code);}
        WriteEvent("anchor",current,0,0,null,SaveFrame(bitmap,"anchor-reference",false));
      }
      InputReady();gridAnchor=last.cells.Select(c=>new Cell{id=c.id,row=c.row,col=c.col,rect=c.rect,selected=c.selected,emphasized=c.emphasized,appearance=(byte[])c.appearance.Clone(),canonical=c.canonical==null?null:(byte[])c.canonical.Clone()}).ToArray();anchorGeometry=last.geometryKey;
    }
    int width,height;Geometry(out width,out height);
    using(var bytes=new MemoryStream())using(var writer=new BinaryWriter(bytes)) {
      writer.Write(4);writer.Write(processId);writer.Write(started);writer.Write(width);writer.Write(height);
      var geometry=System.Text.Encoding.UTF8.GetBytes(anchorGeometry);writer.Write(geometry.Length);writer.Write(geometry);writer.Write(gridAnchor.Length);
      foreach(var c in gridAnchor){writer.Write(c.row);writer.Write(c.col);writer.Write(c.rect.X);writer.Write(c.rect.Y);writer.Write(c.rect.Width);writer.Write(c.rect.Height);writer.Write((byte)((c.selected?1:0)+(c.canonical!=null?2:0)+(c.emphasized?4:0)));writer.Write(c.appearance);writer.Write(c.canonical??new byte[AppearanceBytes]);}
      writer.Flush();return Convert.ToBase64String(bytes.ToArray());
    }
  }
  public void RestoreAnchor(string encoded) {
    Check(false);if(!paused||gridAnchor!=null)throw new Exception("ANCHOR_LOCKED");
    if(encoded==null||encoded.Length>1048576)throw new Exception("INVALID_ANCHOR");
    var bytes=Convert.FromBase64String(encoded);if(bytes.Length<40||bytes.Length>786432||Convert.ToBase64String(bytes)!=encoded)throw new Exception("INVALID_ANCHOR");
    int width,height;string geometry=Geometry(out width,out height);
    using(var stream=new MemoryStream(bytes))using(var reader=new BinaryReader(stream)) {
      if(reader.ReadInt32()!=4)throw new Exception("INVALID_ANCHOR");
      if(reader.ReadUInt32()!=processId||reader.ReadInt64()!=started)throw new Exception("SOURCE_CHANGED");
      if(reader.ReadInt32()!=width||reader.ReadInt32()!=height)throw new Exception("GEOMETRY_CHANGED");
      int length=reader.ReadInt32();if(length<1||length>128)throw new Exception("INVALID_ANCHOR");
      var geometryBytes=reader.ReadBytes(length);if(geometryBytes.Length!=length)throw new Exception("INVALID_ANCHOR");
      string savedGeometry=new System.Text.UTF8Encoding(false,true).GetString(geometryBytes);
      if(savedGeometry!=geometry)throw new Exception("GEOMETRY_CHANGED");
      int count=reader.ReadInt32();if(count<2||count>60)throw new Exception("INVALID_ANCHOR");
      if(stream.Length-stream.Position!=count*(25+AppearanceBytes*2))throw new Exception("INVALID_ANCHOR");
      var saved=new List<Cell>();int previousRow=0,previousCol=-1;
      for(int i=0;i<count;i++) {
        int row=reader.ReadInt32(),col=reader.ReadInt32(),x=reader.ReadInt32(),y=reader.ReadInt32(),w=reader.ReadInt32(),h=reader.ReadInt32();
        bool order=i==0?(row==0&&col==0):(row==previousRow&&col==previousCol+1)||(row==previousRow+1&&col==0);
        if(!order||row<0||row>15||col<0||col>15||x<0||y<0||w<width*.035||w>width*.16||h<height*.045||h>height*.25||(long)x+w>width*.70||(long)y+h>height*.92)throw new Exception("INVALID_ANCHOR");
        if((long)y+(long)(h*1.19)>height)throw new Exception("INVALID_ANCHOR");
        byte renderState=reader.ReadByte();if(renderState>7||((renderState&1)!=0&&(renderState&4)==0))throw new Exception("INVALID_ANCHOR");
        var appearance=reader.ReadBytes(AppearanceBytes);var canonical=reader.ReadBytes(AppearanceBytes);if(appearance.Length!=AppearanceBytes||canonical.Length!=AppearanceBytes)throw new Exception("INVALID_ANCHOR");
        if((renderState&2)==0&&canonical.Any(value=>value!=0))throw new Exception("INVALID_ANCHOR");
        saved.Add(new Cell{id="r"+row+"c"+col,row=row,col=col,rect=new Rectangle(x,y,w,h),selected=(renderState&1)!=0,emphasized=(renderState&4)!=0,appearance=appearance,canonical=(renderState&2)!=0?canonical:null});previousRow=row;previousCol=col;
      }
      if(stream.Position!=stream.Length||saved.Count(cell=>cell.selected)>1)throw new Exception("INVALID_ANCHOR");
      gridAnchor=saved.ToArray();anchorGeometry=savedGeometry;
    }
  }
  public void Prepare() {
    InputReady(); int width,height; Geometry(out width,out height);
    // All detected grid rows end above 90% of the client. Move only (never
    // click) to the fixed bottom-center area so hover scaling cannot change
    // grid evidence or impersonate the selected-card rim. Observe stays read-only.
    POINT point=new POINT { X=width/2,Y=(int)(height*.97) };
    if(!ClientToScreen(handle,ref point)) throw new Exception("SOURCE_CHANGED");
    InputReady(); if(!SetCursorPos(point.X,point.Y)) throw new Exception("INPUT_FAILED"); InputReady();
  }
  public void Select(string id) {
    InputReady();
    var watch=Stopwatch.StartNew();
    using(var bitmap=Grab()) {
      var current=Analyze(bitmap,gridAnchor);
      if(!current.validLayout||current.pageSignature!=last.pageSignature){var code=(current.validLayout?"PAGE_CHANGED:":"PAGE_UNCERTAIN:")+"before "+id+" "+Summary(current);WriteEvent("select",current,0,watch.Elapsed.TotalMilliseconds,code,SaveFrame(bitmap,"select-"+id+"-rejected",false));throw new Exception(code);}
    }
    var cell=last.cells.SingleOrDefault(c=>c.id==id); if(cell==null) throw new Exception("UNKNOWN_CELL");
    POINT point=new POINT { X=cell.rect.Left+cell.rect.Width/2,Y=cell.rect.Top+cell.rect.Height/2 };
    if(!ClientToScreen(handle,ref point)) throw new Exception("SOURCE_CHANGED");
    InputReady(); if(!SetCursorPos(point.X,point.Y)) throw new Exception("INPUT_FAILED"); InputReady();
    var inputs=new INPUT[]{new INPUT { type=0,mouse=new MOUSEINPUT { flags=2 } },new INPUT { type=0,mouse=new MOUSEINPUT { flags=4 } }};
    if(SendInput(2,inputs,Marshal.SizeOf(typeof(INPUT)))!=2) throw new Exception("INPUT_FAILED");
    Prepare();
    WriteEvent("select "+id,null,0,0,"ok ms="+F(watch.Elapsed.TotalMilliseconds),null);
  }
  public string Freeze(string id,out int width,out int height,out bool? gameLocked) {
    InputReady(); POINT pointer;bool pointerOk=ReadPointer(out pointer); var watch=Stopwatch.StartNew(); using(var bitmap=Grab()) {
      var check=Analyze(bitmap,gridAnchor);
      GuardPointer(check,pointer,pointerOk);
      string code=null;
      if(!check.validLayout)code="PAGE_UNCERTAIN:freeze "+id+" "+Summary(check);
      else if(check.selectedCellId!=id)code="SELECTION_UNCONFIRMED:freeze "+id+" saw="+(check.selectedCellId??"none")+" candidate="+(check.selectionCandidate??"none")+" best="+F(check.selectionBest)+" runnerUp="+F(check.selectionRunnerUp);
      else if(check.pageSignature!=last.pageSignature)code="PAGE_CHANGED:freeze "+id+" "+Summary(check);
      else if(check.detailSignature!=last.detailSignature)code="DETAIL_UNSTABLE:freeze "+id+" "+last.detailSignature+">"+check.detailSignature;
      if(code!=null){WriteEvent("freeze "+id,check,0,watch.Elapsed.TotalMilliseconds,code,SaveFrame(bitmap,"freeze-"+id+"-rejected",false));throw new Exception(code);}
      InputReady(); width=bitmap.Width; height=bitmap.Height; gameLocked=check.cells.Single(c=>c.id==id).gameLocked;
      using(var bytes=new MemoryStream()) { bitmap.Save(bytes,ImageFormat.Png); if(bytes.Length>16777216) throw new Exception("FRAME_TOO_LARGE"); InputReady(); WriteEvent("freeze "+id,null,0,0,"ok ms="+F(watch.Elapsed.TotalMilliseconds)+" pngBytes="+bytes.Length,null); return "data:image/png;base64,"+Convert.ToBase64String(bytes.ToArray()); }
    }
  }
  public void Pause() { paused=true; }
  public void Resume() { Check(false); if((GetAsyncKeyState(2)&0x8000)!=0) throw new Exception("INPUT_PAUSED"); emergency=false; paused=false; }
  public void Dispose() { paused=true; if(stopTimer!=null) stopTimer.Dispose(); if(diagnosticsLog!=null){try{diagnosticsLog.Dispose();}catch{}diagnosticsLog=null;} }
}
'@
if ($AnalyzeImage) {
  $bitmap = [System.Drawing.Bitmap]::new($AnalyzeImage)
  try { [Console]::WriteLine(([ArtifactPageScanner]::Analyze($bitmap) | ConvertTo-Json -Depth 8 -Compress)) } finally { $bitmap.Dispose() }
  exit 0
}
try { $scanner = [ArtifactPageScanner]::new($WindowHandle)
  if ($DiagnosticsDir) { $scriptHash = try { (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash } catch { '' }; $scanner.EnableDiagnostics($DiagnosticsDir, $scriptHash) }
  [Console]::WriteLine((@{ready=$true; protocol='page-scan-v1'; pid=$scanner.ProcessId; started=$scanner.Started; scriptVersion=[ArtifactPageScanner]::ScriptVersion; matcherVersion=[ArtifactPageScanner]::MatcherVersion; diagnostics=$scanner.DiagnosticsPath} | ConvertTo-Json -Compress))
}
catch { [Console]::WriteLine((@{ready=$false; error=$_.Exception.Message} | ConvertTo-Json -Compress)); exit 1 }
try {
  while ($null -ne ($line = [Console]::ReadLine())) {
    $requestId = 0
    try {
      if ($line.Length -gt 1049600) { throw 'INVALID_COMMAND' }
      $request = $line | ConvertFrom-Json; $requestId = $request.id
      if ($requestId -isnot [int] -and $requestId -isnot [long] -or $requestId -lt 1) { throw 'INVALID_COMMAND' }
      switch ($request.action) {
        'observe' { $data=$scanner.Observe() }
        'resume' { $scanner.Resume(); $data=@{ok=$true} }
        'prepare' { $scanner.Prepare(); $data=@{ok=$true} }
        'anchor' { $data=@{ok=$true;anchor=$scanner.Anchor()} }
        'restore-anchor' { if($request.anchor -isnot [string] -or $request.anchor.Length -gt 1048576){throw 'INVALID_ANCHOR'};$scanner.RestoreAnchor($request.anchor);$data=@{ok=$true} }
        'pause' { $scanner.Pause(); $data=@{ok=$true} }
        'select' { if ($request.cellId -notmatch '^r\d{1,2}c\d{1,2}$') {throw 'UNKNOWN_CELL'}; $scanner.Select($request.cellId); $data=@{ok=$true} }
        'freeze' { $w=0; $h=0; $locked=$null; $png=$scanner.Freeze($request.cellId,[ref]$w,[ref]$h,[ref]$locked); $data=@{width=$w; height=$h; image=$png; gameLocked=$locked} }
        default { throw 'INVALID_COMMAND' }
      }
      [Console]::WriteLine((@{id=$requestId; data=$data} | ConvertTo-Json -Depth 9 -Compress))
    } catch {
      $scanner.Pause()
      $failure = $_.Exception; if ($failure.InnerException) { $failure = $failure.InnerException }
      $scanner.LogEvent("error $($request.action)", $failure.Message)
      [Console]::WriteLine((@{id=$requestId; error=$failure.Message} | ConvertTo-Json -Compress))
    }
  }
} finally { $scanner.Dispose() }
