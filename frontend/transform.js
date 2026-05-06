const fs = require('fs');
const path = 'c:/Users/HET PATEL/Desktop/crm-student-admin/frontend/app/(dashboard)/students/[id]/edit/page.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace("export default function NewOrderPage() {", `import { useEffect } from 'react';\n\nexport default function EditOrderPage({ params }: { params: { id: string } }) {\n    const { id } = params;`);

code = code.replace("const createMutation = useMutation({", `
    const { data: studentRes, isLoading: isFetching } = useQuery({
        queryKey: ['student', id],
        queryFn: () => studentsAPI.getById(id),
    })

    useEffect(() => {
        if (studentRes?.data?.data) {
            const s = studentRes.data.data;
            const cf = s.customFields || {};
            setFullName(s.fullName || '');
            setEnrollmentNo(s.enrollmentNo || '');
            setProgramme(s.programme || s.course || '');
            setPhone(s.phone || '');
            setEmail(s.email || '');
            setAlternatePhone(s.alternatePhone || '');
            setAddress(s.address || '');
            setSemester(s.semester || '');
            setBatchYear(s.batchYear || '');
            setAssignedGuideId(s.assignedGuideId?.toString() || '');
            
            setState(cf['State'] || '');
            setCity(cf['City'] || '');
            setSubjectCodes(cf['Subject Codes'] || '');
            setProductType(cf['Product Type'] || PRODUCT_TYPES[0]);
            setDeliveryType(cf['Delivery Type'] || 'Soft Copy');
            setExpertPayment(cf['Expert Payment'] || '');
            setTelecaller(cf['Telecaller'] || '');
            setPriority(cf['Priority'] || 'NORMAL');
            setSpecialInstructions(cf['Special Instructions'] || '');
            setTotalAmount(cf['Decided Price'] || '');
            setAdvancePaid(cf['Advance Paid'] || '');
            setPaymentMode(cf['Payment Mode'] || PAYMENT_MODES[0]);
            setDeliveryDeadline(cf['Delivery Deadline'] || '');
            
            setProjectTopic(cf['Project Topic'] || '');
            setSynopsisDeadline(cf['Synopsis Deadline'] || '');
            setReportDeadline(cf['Report Deadline'] || '');
        }
    }, [studentRes]);

    const createMutation = useMutation({`);

code = code.replace("studentsAPI.create(payload)", "studentsAPI.update(id, payload)");
code = code.replace("'Order created successfully'", "'Order updated successfully'");
code = code.replace("'Failed to create order'", "'Failed to update order'");
code = code.replace(">Add New Order<", ">Edit Order<");
code = code.replace(">Create a direct sale or requirement order<", ">Update order details<");
code = code.replace("> Create Order<", "> Update Order<");
code = code.replace("> Creating...<", "> Updating...<");

fs.writeFileSync(path, code);
console.log('Script executed');
