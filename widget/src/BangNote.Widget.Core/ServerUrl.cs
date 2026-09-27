namespace BangNote.Widget.Core;

public static class ServerUrl
{
    public static string Normalize(string input)
    {
        if (!Uri.TryCreate(input.Trim(), UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new ArgumentException("URL phải bắt đầu bằng http:// hoặc https:// (vd: https://bangnote.vercel.app)");
        }
        return uri.GetLeftPart(UriPartial.Path).TrimEnd('/');
    }
}
